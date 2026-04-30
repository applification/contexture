import * as sandcastle from "@ai-hero/sandcastle";
import { evaluate } from "./eligibility";
import type { ExclusionReason } from "./eligibility";
import { fetchIssueLiveState } from "./gh";
import type { OpenPRClosing } from "./gh";
import { agent, streamLogger } from "./harness";
import type { Issue } from "./issue";
import { AGENTS, COPY_TO_WORKTREE, INSTALL_AND_VERIFY, LABEL } from "./workflow";

export type IssueOutcome =
  | { kind: "ran"; result: sandcastle.SandboxRunResult }
  | { kind: "reconciledSkip"; reason: ExclusionReason };

export function describeExclusion(reason: ExclusionReason): string {
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

export type PipelineContext = {
  iteration: number;
  openPRs: OpenPRClosing[];
  sandboxProvider: sandcastle.SandboxProvider;
};

// Per-issue pipeline: reconciliation → sandbox → implement → maybe review →
// open PR. Returns either a SandboxRunResult or a reconciled-skip reason.
export async function runIssuePipeline(
  issue: Issue,
  ctx: PipelineContext,
): Promise<IssueOutcome> {
  // Reconciliation-lite: re-check the issue's live state before creating a
  // sandbox. Even with one issue per iteration the snapshot can age (a PR
  // opens elsewhere, the issue gets closed) and we don't want to burn a
  // multi-minute sandbox start on stale state. The openPRs cache is the
  // iteration-start snapshot — we deliberately don't re-fetch PRs per issue.
  const live = await fetchIssueLiveState(issue.number);
  const verdict = evaluate(live, ctx.openPRs, { label: LABEL });
  if (!verdict.eligible) {
    console.log(`  ⤺ #${issue.number} skipped (${describeExclusion(verdict.reason)})`);
    return { kind: "reconciledSkip", reason: verdict.reason };
  }

  await using sandbox = await sandcastle.createSandbox({
    sandbox: ctx.sandboxProvider,
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
    logging: streamLogger(`iter${ctx.iteration}-implementer-${issue.number}`),
  });

  // Both reviewer and PR-opener gate on whether *this* implementer run made
  // commits. The previous logic compared `main..HEAD`, which was incorrect
  // when the orchestrator was launched from a feature branch — every commit
  // the launching branch had already added on top of main showed up in the
  // diff and falsely triggered both phases.
  if (implementResult.commits.length === 0) {
    return { kind: "ran", result: implementResult };
  }

  const thisRunPaths = await pathsTouchedByCommits(sandbox.worktreePath, implementResult.commits);
  const allMarkdown = thisRunPaths.length > 0 && thisRunPaths.every((p) => p.endsWith(".md"));
  const skipReview = docsOnly || allMarkdown;

  if (!skipReview) {
    await sandbox.run({
      name: "Reviewer #" + issue.number,
      agent: agent(AGENTS.reviewer),
      promptFile: AGENTS.reviewer.promptPath,
      promptArgs: issuePromptArgs,
      logging: streamLogger(`iter${ctx.iteration}-reviewer-${issue.number}`),
    });
  }

  await sandbox.run({
    name: "PR-Opener #" + issue.number,
    agent: agent(AGENTS.prOpener),
    promptFile: AGENTS.prOpener.promptPath,
    promptArgs: issuePromptArgs,
    logging: streamLogger(`iter${ctx.iteration}-pr-${issue.number}`),
  });

  return { kind: "ran", result: implementResult };
}
