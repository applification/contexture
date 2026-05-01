import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { evaluate, pickEligible } from "./eligibility";
import type { ExclusionReason } from "./eligibility";
import { fetchIssueLiveState, fetchOpenPRsClosingIssues, fetchProjectReadyIssues } from "./github";
import { enforcementFor } from "./enforcement";
import { agent, emitPhaseOutcome, emitRunStart, emitUsageFromRun, streamLogger } from "./harness";
import type { AgentSpec } from "./harness";
import type { Issue } from "./issue";

// ---------- Tracker conventions ----------

// GitHub label used to opt issues into the Sandcastle workflow.
const LABEL = "Sandcastle";

// Source of truth for issue selection: the Contexture project board's `Ready`
// column, scoped to this repo. The board's drag-order drives what Sandcastle
// picks first — see `fetchProjectReadyIssues`. Requires the gh token to carry
// the `read:project` scope (`gh auth refresh -s read:project`).
const PROJECT_OWNER = "applification";
const PROJECT_NUMBER = 1;
const PROJECT_REPO = "applification/contexture";

// ---------- Orchestrator limits ----------

// Each iteration drains a parallel batch of up to MAX_PARALLEL issues. We
// take the top N from the project board's Ready column (no LLM planner) —
// merge conflicts on overlapping PRs are a normal git outcome, not worth an
// LLM round-trip to predict. MAX_ITERATIONS is a safety cap; most runs exit
// early when Ready is drained.
const MAX_ITERATIONS = 5;
const MAX_PARALLEL = 2;

// ---------- Sandbox setup ----------

// Skip host->worktree copy: this monorepo's node_modules is ~3.5GB and blows
// past sandcastle's hard-coded 60s copy timeout. The implementer sandbox runs
// `bun install` inside the container instead. Env files are gitignored, so
// copy them in explicitly.
const COPY_TO_WORKTREE: readonly string[] = ["apps/desktop/.env", "apps/web/.env.local"];

// Verify the install actually produced a usable workspace. `bun install` exits
// 0 even when individual extractions are mangled, so we follow with `turbo
// typecheck`, which resolves and loads imports across every workspace and
// fails loudly if a package's main entry is missing.
const INSTALL_AND_VERIFY = "bun install && bun run typecheck";

// ---------- Agent specs ----------

// Each agent is keyed by purpose. Effort levels reflect Sandcastle's intended
// workload: simple bug fixes and minor tweaks. Anything complex is handled
// HITL in Claude Code, not here — so we don't pay for high-effort thinking
// on routine work. Reviewer is the exception: edge-case stress-testing
// genuinely benefits from extended thinking, and it's the last gate before a
// human review.
//
// PR creation is not an agent — it's a host-side `git push` + `gh pr create
// --fill` after the sandbox sync. Inside the container the agent has no
// credentials for the remote, and an LLM round-trip to write a PR body
// duplicates work the conventional commits already do.
const AGENTS = {
  implementer: {
    provider: "claudeCode",
    model: "claude-sonnet-4-6",
    effort: "medium",
    promptPath: "./.sandcastle/implement-prompt.md",
  },
  implementerDocs: {
    provider: "claudeCode",
    model: "claude-haiku-4-5-20251001",
    effort: "low",
    promptPath: "./.sandcastle/implement-docs-prompt.md",
  },
  reviewer: {
    provider: "claudeCode",
    model: "claude-sonnet-4-6",
    effort: "high",
    promptPath: "./.sandcastle/review-prompt.md",
  },
} as const satisfies Record<string, AgentSpec>;

// ---------- Sandbox provider ----------

// Each sandbox gets its own bun cache. Sharing ~/.bun/install/cache across
// parallel sandboxes races on tarball extraction and silently produces broken
// installs (e.g. a package with package.json pointing at a build/ output that
// was never written). Cold installs are slower; broken node_modules are worse.
const sandboxProvider = docker({});

function describeExclusion(reason: ExclusionReason): string {
  switch (reason.kind) {
    case "issueClosed":
      return "issue closed";
    case "missingLabel":
      return `${LABEL} label missing`;
    case "claimedByPR":
      return `claimed by PR #${reason.pr}`;
  }
}

const isDocsOnly = (issue: Issue) =>
  issue.labels.includes("documentation") && !issue.labels.some((l) => l !== "documentation" && l !== LABEL);

async function gitOutput(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// Run a command and surface stderr if it fails. Used for the host-side
// `git push` and `gh pr create` after the sandbox finishes — we want a
// clear failure mode, not a silent skip.
async function runOrFail(cmd: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${cmd.join(" ")} failed (exit ${code}): ${stderr.trim() || stdout.trim()}`);
  }
  return stdout;
}

// Push the branch and open a PR from the host. Sandcastle has already
// synced the sandbox commits to the host's branch by the time we get here,
// so we use the host's existing git/gh credentials — no in-container
// credential plumbing needed.
//
// Title comes from the first commit (via `--fill-first`); body lists all
// commit subjects on the branch plus `Closes #N` so merging auto-closes
// the issue. We construct the body explicitly because passing `--body`
// alongside `--fill` would replace the commit-derived body, and `--fill`
// alone has no way to append the Closes line.
async function openPullRequest(branch: string, issueNumber: number, cwd: string): Promise<string> {
  await runOrFail(["git", "push", "-u", "origin", branch], cwd);
  const subjects = (await gitOutput(["log", `main..${branch}`, "--reverse", "--format=%s"], cwd))
    .split("\n")
    .filter((s) => s.length > 0);
  const summary = subjects.length > 0 ? subjects.map((s) => `- ${s}`).join("\n") : "- (no commits)";
  const body = `## Summary\n\n${summary}\n\nCloses #${issueNumber}`;
  const url = await runOrFail(
    ["gh", "pr", "create", "--head", branch, "--fill-first", "--body", body],
    cwd,
  );
  return url.trim();
}

// Files changed by `commits` relative to their first parent. We pass the SHA
// range `<first>^..<last>` so we capture exactly the work the agent
// introduced this run, regardless of where main currently sits or which
// branch the orchestrator was launched from.
async function pathsTouchedByCommits(worktreePath: string, commits: { sha: string }[]): Promise<string[]> {
  if (commits.length === 0) return [];
  const first = commits[0]?.sha ?? "";
  const last = commits[commits.length - 1]?.sha ?? "";
  const range = `${first}^..${last}`;
  const out = await gitOutput(["diff", "--name-only", range], worktreePath);
  return out.split("\n").filter((p) => p.length > 0);
}

// Pre-flight: confirm the gh token has `read:project` scope before we start
// burning iterations. The project query is the only call that needs the
// scope; if it fails here, every iteration would fail the same way. Surface
// the fix-up command so a clean machine can recover without spelunking.
try {
  await fetchProjectReadyIssues(PROJECT_OWNER, PROJECT_NUMBER, PROJECT_REPO, LABEL);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(
    `Failed to query project ${PROJECT_OWNER}/${PROJECT_NUMBER}: ${msg}\n` +
      `If this is a missing-scope error, run: gh auth refresh -s read:project`,
  );
  process.exit(1);
}

emitRunStart();

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // Phase 1: Eligibility. Snapshots come from the project board's Ready
  // column in user-controlled drag-order; pickEligible() applies the
  // existing label / claim-by-PR filters and preserves that order so the
  // batch is the user's top N picks.
  const [snapshots, openPRs] = await Promise.all([
    fetchProjectReadyIssues(PROJECT_OWNER, PROJECT_NUMBER, PROJECT_REPO, LABEL),
    fetchOpenPRsClosingIssues(),
  ]);

  const { eligible, excluded } = pickEligible(snapshots, openPRs, { label: LABEL });

  for (const e of excluded) {
    console.log(`  - #${e.number} excluded: ${describeExclusion(e.reason)}`);
  }

  const batch = eligible.slice(0, MAX_PARALLEL);
  if (batch.length === 0) {
    console.log("No eligible issues this iteration. Exiting.");
    break;
  }

  console.log(`Batch of ${batch.length}:`);
  for (const issue of batch) {
    console.log(`  #${issue.number}: ${issue.title} → ${issue.branch} [${issue.labels.join(", ")}]`);
  }

  // Phase 2: per-issue pipeline (implement → maybe review → open PR), run in
  // parallel across the batch. Each task is fully independent — its own
  // sandbox/worktree, its own agent runs, its own host-side PR creation.
  // Outcomes: "commits" if the implementer produced at least one commit (PR
  // opened), "no-commits" if it did not, "error" on any thrown failure. We
  // exit the outer loop when no task in the batch produced commits — that's
  // the kill-switch against burning iterations on a systemically broken setup.
  type Outcome = { kind: "commits" | "no-commits" | "error"; issue: Issue };

  const runIssue = async (issue: Issue): Promise<Outcome> => {
    const tag = `[#${issue.number}]`;
    try {
      // Reconciliation-lite: re-check the issue's live state before creating
      // a sandbox. The iteration-start snapshot can age while earlier batch
      // items run, and we don't want to burn a multi-minute sandbox start on
      // stale state. The openPRs cache stays iteration-start — we
      // deliberately don't re-fetch PRs per issue.
      const live = await fetchIssueLiveState(issue.number);
      const verdict = evaluate(live, openPRs, { label: LABEL });
      if (!verdict.eligible) {
        console.log(`${tag}  ⤺ skipped (${describeExclusion(verdict.reason)})`);
        return { kind: "no-commits", issue };
      }

      await using sandbox = await sandcastle.createSandbox({
        sandbox: sandboxProvider,
        branch: issue.branch,
        hooks: { sandbox: { onSandboxReady: [{ command: INSTALL_AND_VERIFY }] } },
        copyToWorktree: [...COPY_TO_WORKTREE],
      });

      const docsOnly = isDocsOnly(issue);
      const implementerSpec = docsOnly ? AGENTS.implementerDocs : AGENTS.implementer;

      await enforcementFor(implementerSpec)?.install(sandbox.worktreePath);

      const issuePromptArgs = {
        ISSUE_NUMBER: String(issue.number),
        ISSUE_TITLE: issue.title,
        BRANCH: issue.branch,
      };

      const implementerLogName = `iter${iteration}-implementer-${issue.number}`;
      const implementResult = await sandbox.run({
        name: "Implementer #" + issue.number,
        agent: agent(implementerSpec),
        promptFile: implementerSpec.promptPath,
        promptArgs: issuePromptArgs,
        logging: streamLogger(implementerLogName),
      });
      emitUsageFromRun(implementerLogName, iteration, implementResult.iterations);
      emitPhaseOutcome("implementer", iteration, issue.number, implementResult.commits.length);

      // Reviewer and PR creation both gate on whether *this* implementer run
      // made commits. Comparing `main..HEAD` would be incorrect when the
      // orchestrator is launched from a feature branch — every commit the
      // launching branch had already added on top of main would falsely
      // trigger both phases.
      if (implementResult.commits.length === 0) {
        console.log(`${tag}  no progress`);
        return { kind: "no-commits", issue };
      }

      const thisRunPaths = await pathsTouchedByCommits(sandbox.worktreePath, implementResult.commits);
      const allMarkdown = thisRunPaths.length > 0 && thisRunPaths.every((p) => p.endsWith(".md"));
      const skipReview = docsOnly || allMarkdown;

      if (!skipReview) {
        const reviewerLogName = `iter${iteration}-reviewer-${issue.number}`;
        const reviewerResult = await sandbox.run({
          name: "Reviewer #" + issue.number,
          agent: agent(AGENTS.reviewer),
          promptFile: AGENTS.reviewer.promptPath,
          promptArgs: issuePromptArgs,
          logging: streamLogger(reviewerLogName),
        });
        emitUsageFromRun(reviewerLogName, iteration, reviewerResult.iterations);
        emitPhaseOutcome("reviewer", iteration, issue.number, reviewerResult.commits.length);
        console.log(
          reviewerResult.commits.length > 0
            ? `${tag}  ✎ Reviewer made ${reviewerResult.commits.length} commit(s)`
            : `${tag}  ∅ Reviewer made no commits`,
        );
      }

      // PR creation runs on the host: sandcastle has already applied the
      // sandbox's commits to the host's branch via syncOut, so we push and
      // open the PR using the host's git/gh credentials. Pushes target
      // distinct branches across the batch, so concurrent push+create from
      // sibling tasks don't conflict.
      const prUrl = await openPullRequest(issue.branch, issue.number, process.cwd());
      console.log(`${tag}  ✔ PR opened: ${prUrl}`);
      return { kind: "commits", issue };
    } catch (reason) {
      const errorTag =
        typeof reason === "object" && reason !== null && "_tag" in reason
          ? String((reason as { _tag: unknown })._tag)
          : reason instanceof Error
            ? reason.constructor.name
            : "UnknownError";
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error(`${tag}  ✗ (${issue.branch}) failed [${errorTag}]: ${message}`);
      return { kind: "error", issue };
    }
  };

  const results = await Promise.all(batch.map(runIssue));
  const commitCount = results.filter((r) => r.kind === "commits").length;

  console.log(
    `\nIteration ${iteration} complete. ${commitCount}/${batch.length} produced commits.`,
  );

  if (commitCount === 0) {
    console.log("No progress this iteration. Exiting.");
    break;
  }
}

console.log("\nAll done.");

// Auto-run the analyzer at end-of-orchestration so every run produces a
// fresh `.sandcastle/logs/analysis.md`. Skipped with --no-analyze; failures
// are non-fatal (we don't want a bad analyzer to break sandcastle).
if (!process.argv.includes("--no-analyze")) {
  try {
    await import("./analyze");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Analyzer failed: ${msg}`);
  }
}
