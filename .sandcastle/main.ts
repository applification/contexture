import { mkdirSync, appendFileSync } from "node:fs";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import type { AgentStreamEvent, LoggingOption } from "@ai-hero/sandcastle";

const MAX_ITERATIONS = 10;
const MAX_PARALLEL = 4;

// Skip host->worktree copy: this monorepo's node_modules is ~3.5GB and
// blows past sandcastle's hard-coded 60s copy timeout. The implementer
// sandbox runs `bun install` inside the container instead.
// Env files are gitignored, so copy them in explicitly.
const copyToWorktree: string[] = ["apps/desktop/.env", "apps/web/.env.local"];

// Mount the host bun cache so parallel sandboxes share install artefacts and
// `bun install` is warm across iterations.
const sandboxProvider = docker({
  mounts: [{ hostPath: "~/.bun/install/cache", sandboxPath: "/home/agent/.bun/install/cache" }],
});

mkdirSync(".sandcastle/logs/plans", { recursive: true });
const STREAM_LOG_PATH = ".sandcastle/logs/stream.log";

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

type Issue = { number: number; title: string; branch: string; labels: string[] };

const isDocsOnly = (issue: Issue) =>
  issue.labels.includes("documentation") &&
  !issue.labels.some((l) => l !== "documentation" && l !== "Sandcastle");

const isSandboxStartupError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return /docker|sandbox|container|image|network|ECONNREFUSED|EPIPE/i.test(msg);
};

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
  try {
    return await sandcastle.createSandbox({
      sandbox: sandboxProvider,
      branch: issue.branch,
      hooks: { sandbox: { onSandboxReady: [{ command: "bun install" }] } },
      copyToWorktree,
    });
  } catch (err) {
    if (!isSandboxStartupError(err)) throw err;
    console.warn(`  ↻ #${issue.number} retry after sandbox startup error: ${err}`);
    return sandcastle.createSandbox({
      sandbox: sandboxProvider,
      branch: issue.branch,
      hooks: { sandbox: { onSandboxReady: [{ command: "bun install" }] } },
      copyToWorktree,
    });
  }
}

async function runIssue(issue: Issue, iteration: number) {
  await using sandbox = await createIssueSandboxWithRetry(issue);

  const docsOnly = isDocsOnly(issue);
  const implementPromptFile = docsOnly
    ? "./.sandcastle/implement-docs-prompt.md"
    : "./.sandcastle/implement-prompt.md";

  const implementResult = await sandbox.run({
    name: "Implementer #" + issue.number,
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: implementPromptFile,
    promptArgs: {
      ISSUE_NUMBER: String(issue.number),
      ISSUE_TITLE: issue.title,
      BRANCH: issue.branch,
    },
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
      agent: sandcastle.claudeCode("claude-opus-4-6"),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: {
        ISSUE_NUMBER: String(issue.number),
        ISSUE_TITLE: issue.title,
        BRANCH: issue.branch,
      },
      logging: streamLogger(`iter${iteration}-reviewer-${issue.number}`),
    });
  }

  await sandbox.run({
    name: "PR-Opener #" + issue.number,
    agent: sandcastle.claudeCode("claude-opus-4-6", { effort: "low" }),
    promptFile: "./.sandcastle/pr-prompt.md",
    promptArgs: {
      ISSUE_NUMBER: String(issue.number),
      ISSUE_TITLE: issue.title,
      BRANCH: issue.branch,
    },
    logging: streamLogger(`iter${iteration}-pr-${issue.number}`),
  });

  return implementResult;
}

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // Phase 1: Plan
  const plan = await sandcastle.run({
    sandbox: sandboxProvider,
    name: "Planner",
    agent: sandcastle.claudeCode("claude-opus-4-6", { effort: "high" }),
    promptFile: "./.sandcastle/plan-prompt.md",
    logging: streamLogger(`iter${iteration}-planner`),
  });

  await Bun.write(`.sandcastle/logs/plans/plan-${iteration}.md`, plan.stdout);

  const planMatch = plan.stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!planMatch) {
    throw new Error("Orchestrator did not produce a <plan> tag.\n\n" + plan.stdout);
  }

  const { issues } = JSON.parse(planMatch[1]!) as { issues: Issue[] };

  if (issues.length === 0) {
    console.log("No issues to work on. Exiting.");
    break;
  }

  console.log(`Planning complete. ${issues.length} issue(s) to work in parallel:`);
  for (const issue of issues) {
    console.log(`  #${issue.number}: ${issue.title} → ${issue.branch} [${issue.labels.join(", ")}]`);
  }

  // Phase 2: per-issue pipeline (implement → maybe review → open PR), max 4 in parallel
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
      console.error(`  ✗ #${issues[i]!.number} (${issues[i]!.branch}) failed: ${outcome.reason}`);
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
