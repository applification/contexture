import { mkdirSync, appendFileSync } from "node:fs";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import type { AgentStreamEvent, LoggingOption } from "@ai-hero/sandcastle";
import { pickEligible } from "./eligibility";
import { fetchOpenLabelledIssues, fetchOpenPRsClosingIssues } from "./gh";
import { parsePlan } from "./plan";
import type { Issue } from "./plan";
import { isSandboxStartupRetryable, retryWithBackoff } from "./retry";
import {
  AGENTS,
  COPY_TO_WORKTREE,
  INSTALL_AND_VERIFY,
  LABEL,
  MAX_ITERATIONS,
  MAX_PARALLEL,
} from "./workflow";
import type { AgentSpec } from "./workflow";

// Each sandbox gets its own bun cache. Sharing ~/.bun/install/cache across
// parallel sandboxes races on tarball extraction and silently produces broken
// installs (e.g. a package with package.json pointing at a build/ output that
// was never written). Cold installs are slower; broken node_modules are worse.
const sandboxProvider = docker({});

mkdirSync(".sandcastle/logs/plans", { recursive: true });
const STREAM_LOG_PATH = ".sandcastle/logs/stream.log";

// Build a sandcastle AgentProvider from an AgentSpec. Dispatches on the
// `provider` discriminator so adding a new backend means adding a case here
// (and a variant in workflow.ts), not touching every call site.
function agent(spec: AgentSpec) {
  switch (spec.provider) {
    case "claudeCode":
      return spec.effort === undefined
        ? sandcastle.claudeCode(spec.model)
        : sandcastle.claudeCode(spec.model, { effort: spec.effort });
    case "codex":
      return spec.effort === undefined
        ? sandcastle.codex(spec.model)
        : sandcastle.codex(spec.model, { effort: spec.effort });
    case "opencode":
      return sandcastle.opencode(spec.model);
    case "pi":
      return sandcastle.pi(spec.model);
  }
}

function streamLogger(name: string): LoggingOption {
  return {
    type: "file",
    path: `.sandcastle/logs/${name}.log`,
    onAgentStreamEvent: (event: AgentStreamEvent) => {
      const line =
        event.type === "text"
          ? JSON.stringify({ name, iter: event.iteration, t: event.timestamp, type: "text", text: event.message })
          : JSON.stringify({
              name,
              iter: event.iteration,
              t: event.timestamp,
              type: "tool",
              tool: event.name,
              args: event.formattedArgs,
            });
      appendFileSync(STREAM_LOG_PATH, line + "\n");
    },
  };
}

const isDocsOnly = (issue: Issue) =>
  issue.labels.includes("documentation") &&
  !issue.labels.some((l) => l !== "documentation" && l !== LABEL);

async function changedPaths(worktreePath: string): Promise<string[]> {
  const proc = Bun.spawn(["git", "diff", "--name-only", "main..HEAD"], {
    cwd: worktreePath,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.split("\n").filter((p) => p.length > 0);
}

async function createIssueSandboxWithRetry(issue: Issue) {
  return retryWithBackoff(
    () =>
      sandcastle.createSandbox({
        sandbox: sandboxProvider,
        branch: issue.branch,
        hooks: { sandbox: { onSandboxReady: [{ command: INSTALL_AND_VERIFY }] } },
        copyToWorktree: [...COPY_TO_WORKTREE],
      }),
    {
      maxAttempts: 2,
      baseMs: 2000,
      jitter: true,
      isRetryable: isSandboxStartupRetryable,
      onRetry: ({ attempt, nextDelayMs, error }) => {
        const tag = (error as { _tag?: unknown })._tag ?? "unknown";
        console.warn(
          `  ↻ #${issue.number} attempt ${attempt} failed (${tag}); retrying in ${nextDelayMs}ms`,
        );
      },
    },
  );
}

async function runIssue(issue: Issue, iteration: number) {
  await using sandbox = await createIssueSandboxWithRetry(issue);

  const docsOnly = isDocsOnly(issue);
  const implementerSpec = docsOnly ? AGENTS.implementerDocs : AGENTS.implementer;

  const issuePromptArgs = {
    ISSUE_NUMBER: String(issue.number),
    ISSUE_TITLE: issue.title,
    BRANCH: issue.branch,
  };

  const implementResult = await sandbox.run({
    name: "Implementer #" + issue.number,
    agent: agent(implementerSpec),
    promptFile: implementerSpec.promptPath,
    promptArgs: issuePromptArgs,
    logging: streamLogger(`iter${iteration}-implementer-${issue.number}`),
  });

  // Use branch-vs-main diff (not just this run's commits) so that a re-run
  // on a branch already containing prior work still opens its PR.
  const paths = await changedPaths(sandbox.worktreePath);
  if (paths.length === 0) {
    return implementResult;
  }

  const allMarkdown = paths.every((p) => p.endsWith(".md"));
  const skipReview = docsOnly || allMarkdown;

  if (!skipReview) {
    await sandbox.run({
      name: "Reviewer #" + issue.number,
      agent: agent(AGENTS.reviewer),
      promptFile: AGENTS.reviewer.promptPath,
      promptArgs: issuePromptArgs,
      logging: streamLogger(`iter${iteration}-reviewer-${issue.number}`),
    });
  }

  await sandbox.run({
    name: "PR-Opener #" + issue.number,
    agent: agent(AGENTS.prOpener),
    promptFile: AGENTS.prOpener.promptPath,
    promptArgs: issuePromptArgs,
    logging: streamLogger(`iter${iteration}-pr-${issue.number}`),
  });

  return implementResult;
}

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // Phase 1: Eligibility (deterministic) → optional subset selection (LLM).
  // pickEligible() filters by label and excludes issues already claimed by an
  // open PR; it returns already-validated Issue objects with deterministic
  // branch names. The LLM only runs when 2+ candidates survive (conflict
  // avoidance); a single eligible issue is dispatched directly.
  const [rawIssues, openPRs] = await Promise.all([
    fetchOpenLabelledIssues(LABEL),
    fetchOpenPRsClosingIssues(),
  ]);

  const { eligible, needsPlanner, excluded } = pickEligible(rawIssues, openPRs, { label: LABEL });

  for (const e of excluded) {
    const detail = e.reason.kind === "claimedByPR" ? `claimed by PR #${e.reason.pr}` : e.reason.kind;
    console.log(`  - #${e.number} excluded: ${detail}`);
  }

  if (eligible.length === 0) {
    console.log("No eligible issues this iteration. Exiting.");
    break;
  }

  let issues: Issue[];
  if (needsPlanner) {
    console.log(
      `  ${eligible.length} eligible candidates; running subset selector for conflict avoidance.`,
    );
    const candidatesJson = JSON.stringify(eligible);
    const plan = await sandcastle.run({
      sandbox: sandboxProvider,
      name: "Subset selector",
      agent: agent(AGENTS.subsetSelector),
      promptFile: AGENTS.subsetSelector.promptPath,
      promptArgs: {
        LABEL,
        MAX_PARALLEL: String(MAX_PARALLEL),
        CANDIDATES_JSON: candidatesJson,
      },
      logging: streamLogger(`iter${iteration}-subset-selector`),
    });
    await Bun.write(`.sandcastle/logs/plans/plan-${iteration}.md`, plan.stdout);
    issues = parsePlan(plan.stdout).issues;
  } else {
    console.log("  1 eligible candidate; skipping subset selector.");
    issues = eligible;
  }

  if (issues.length === 0) {
    console.log("No issues to work on. Exiting.");
    break;
  }

  console.log(`Planning complete. ${issues.length} issue(s) to work in parallel:`);
  for (const issue of issues) {
    console.log(`  #${issue.number}: ${issue.title} → ${issue.branch} [${issue.labels.join(", ")}]`);
  }

  // Phase 2: per-issue pipeline (implement → maybe review → open PR), max N in parallel
  let running = 0;
  const queue: (() => void)[] = [];
  const acquire = () =>
    running < MAX_PARALLEL ? (running++, Promise.resolve()) : new Promise<void>((resolve) => queue.push(resolve));
  const release = () => {
    running--;
    const next = queue.shift();
    if (next) {
      running++;
      next();
    }
  };

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      await acquire();
      try {
        return await runIssue(issue, iteration);
      } finally {
        release();
      }
    }),
  );

  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      const issue = issues[i]!;
      const reason: unknown = outcome.reason;
      const errorTag =
        typeof reason === "object" && reason !== null && "_tag" in reason
          ? String((reason as { _tag: unknown })._tag)
          : reason instanceof Error
            ? reason.constructor.name
            : "UnknownError";
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error(
        `  ✗ #${issue.number} (${issue.branch}) failed [${errorTag}]: ${message}`,
      );
    }
  }

  const completed = settled.filter(
    (o): o is PromiseFulfilledResult<sandcastle.SandboxRunResult> =>
      o.status === "fulfilled" && o.value.commits.length > 0,
  );

  console.log(`\nIteration ${iteration} complete. ${completed.length}/${issues.length} issue(s) produced commits.`);

  if (completed.length === 0) {
    console.log("No progress this iteration. Exiting.");
    break;
  }
}

console.log("\nAll done.");
