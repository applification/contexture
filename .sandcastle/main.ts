import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { evaluate, pickEligible } from "./eligibility";
import type { ExclusionReason } from "./eligibility";
import { fetchIssueLiveState, fetchOpenLabelledIssues, fetchOpenPRsClosingIssues } from "./gh";
import { agent, streamLogger } from "./harness";
import type { Issue } from "./issue";
import { AGENTS, COPY_TO_WORKTREE, INSTALL_AND_VERIFY, LABEL, MAX_ITERATIONS } from "./workflow";

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
  issue.labels.includes("documentation") &&
  !issue.labels.some((l) => l !== "documentation" && l !== LABEL);

async function gitOutput(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// Files changed by `commits` relative to their first parent. We pass the SHA
// range `<first>^..<last>` so we capture exactly the work the agent
// introduced this run, regardless of where main currently sits or which
// branch the orchestrator was launched from.
async function pathsTouchedByCommits(
  worktreePath: string,
  commits: { sha: string }[],
): Promise<string[]> {
  if (commits.length === 0) return [];
  const first = commits[0]?.sha ?? "";
  const last = commits[commits.length - 1]?.sha ?? "";
  const range = `${first}^..${last}`;
  const out = await gitOutput(["diff", "--name-only", range], worktreePath);
  return out.split("\n").filter((p) => p.length > 0);
}

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // Phase 1: Eligibility (deterministic). pickEligible() filters by label and
  // excludes issues already claimed by an open PR; survivors come back sorted
  // by issue number ascending so we can take the oldest with [0].
  const [snapshots, openPRs] = await Promise.all([
    fetchOpenLabelledIssues(LABEL),
    fetchOpenPRsClosingIssues(),
  ]);

  const { eligible, excluded } = pickEligible(snapshots, openPRs, { label: LABEL });

  for (const e of excluded) {
    console.log(`  - #${e.number} excluded: ${describeExclusion(e.reason)}`);
  }

  const issue = eligible[0];
  if (issue === undefined) {
    console.log("No eligible issues this iteration. Exiting.");
    break;
  }

  console.log(
    `Working on #${issue.number}: ${issue.title} → ${issue.branch} [${issue.labels.join(", ")}]`,
  );

  // Phase 2: per-issue pipeline (implement → maybe review → open PR).
  let madeCommits = false;
  try {
    // Reconciliation-lite: re-check the issue's live state before creating a
    // sandbox. Even with one issue per iteration the snapshot can age (a PR
    // opens elsewhere, the issue gets closed) and we don't want to burn a
    // multi-minute sandbox start on stale state. The openPRs cache is the
    // iteration-start snapshot — we deliberately don't re-fetch PRs per issue.
    const live = await fetchIssueLiveState(issue.number);
    const verdict = evaluate(live, openPRs, { label: LABEL });
    if (!verdict.eligible) {
      console.log(`  ⤺ #${issue.number} skipped (${describeExclusion(verdict.reason)})`);
      console.log(`\nIteration ${iteration} complete. #${issue.number} reconciled-skip.`);
      continue;
    }

    await using sandbox = await sandcastle.createSandbox({
      sandbox: sandboxProvider,
      branch: issue.branch,
      hooks: { sandbox: { onSandboxReady: [{ command: INSTALL_AND_VERIFY }] } },
      copyToWorktree: [...COPY_TO_WORKTREE],
    });

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

    // Both reviewer and PR-opener gate on whether *this* implementer run made
    // commits. Comparing `main..HEAD` would be incorrect when the orchestrator
    // is launched from a feature branch — every commit the launching branch
    // had already added on top of main would falsely trigger both phases.
    if (implementResult.commits.length === 0) {
      console.log(`\nIteration ${iteration} complete. #${issue.number} made no progress.`);
      console.log("No progress this iteration. Exiting.");
      break;
    }

    madeCommits = true;

    const thisRunPaths = await pathsTouchedByCommits(sandbox.worktreePath, implementResult.commits);
    const allMarkdown = thisRunPaths.length > 0 && thisRunPaths.every((p) => p.endsWith(".md"));
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
  } catch (reason) {
    const errorTag =
      typeof reason === "object" && reason !== null && "_tag" in reason
        ? String((reason as { _tag: unknown })._tag)
        : reason instanceof Error
          ? reason.constructor.name
          : "UnknownError";
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`  ✗ #${issue.number} (${issue.branch}) failed [${errorTag}]: ${message}`);
    continue;
  }

  console.log(
    `\nIteration ${iteration} complete. #${issue.number} ${madeCommits ? "produced commits" : "made no progress"}.`,
  );
}

console.log("\nAll done.");
