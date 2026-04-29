import slugify from "@sindresorhus/slugify";
import type { OpenPRClosing, IssueLiveState, RawIssue } from "./gh";
import { Issue } from "./plan";
import type { Issue as IssueT } from "./plan";

// Deterministic, idempotent issue → branch derivation. Uses
// @sindresorhus/slugify (battle-tested, handles Unicode + repeated separators)
// then truncates to keep the final branch under plan.ts's 200-char cap.
//
// The cap on the slug accounts for the fixed prefix `sandcastle/issue-{N}-`,
// which is at most ~26 chars (issue numbers under 10^7). Truncating slug at
// 160 leaves comfortable headroom and avoids ever pushing branches past 200.
const MAX_SLUG_LENGTH = 160;

export function makeBranch(issueNumber: number, title: string): string {
  const rawSlug = slugify(title, { separator: "-", lowercase: true });
  // Slugify can return an empty string for titles with no slug-able content
  // (e.g. only emoji). Fall back to a stable placeholder so the branch is
  // still valid against the regex (`[a-z0-9._-]+` requires at least one char).
  const slug = (rawSlug.length === 0 ? "untitled" : rawSlug).slice(0, MAX_SLUG_LENGTH);
  return `sandcastle/issue-${issueNumber}-${slug}`;
}

export type EligibilityConfig = {
  label: string;
};

export type EligibilityResult = {
  eligible: IssueT[];
  // True when more than one candidate survives filtering. The orchestrator
  // dispatches a subset-selection agent only in that case; a single eligible
  // issue is dispatched directly without an LLM round-trip.
  needsPlanner: boolean;
  // Why each excluded issue was skipped. Useful for iteration logs.
  excluded: Array<{ number: number; reason: ExclusionReason }>;
};

export type ExclusionReason =
  | { kind: "missingLabel" }
  | { kind: "claimedByPR"; pr: number };

function hasLabel(issue: { labels: { name: string }[] }, label: string): boolean {
  return issue.labels.some((l) => l.name === label);
}

function findClaimingPR(issueNumber: number, openPRs: OpenPRClosing[]): number | undefined {
  return openPRs.find((p) => p.closes.includes(issueNumber))?.pr;
}

// Deterministic eligibility filter. Produces already-validated `Issue` values
// (via plan.ts's Zod schema) so downstream code never sees malformed shapes.
//
// Filters applied (in order):
// 1. Issue must carry the configured tracker label.
// 2. Issue must not be claimed by an open PR (via Closes/Fixes/Resolves #N).
//
// PRD detection, prose-blocker heuristics, and overlapping-path heuristics
// were considered and rejected: there's no current corpus of open Sandcastle
// issues to validate them against, and the count-based planner gating below
// gives the same safety net for free.
export function pickEligible(
  issues: RawIssue[],
  openPRs: OpenPRClosing[],
  config: EligibilityConfig,
): EligibilityResult {
  const excluded: EligibilityResult["excluded"] = [];
  const eligible: IssueT[] = [];

  for (const issue of issues) {
    if (!hasLabel(issue, config.label)) {
      excluded.push({ number: issue.number, reason: { kind: "missingLabel" } });
      continue;
    }
    const claimingPR = findClaimingPR(issue.number, openPRs);
    if (claimingPR !== undefined) {
      excluded.push({
        number: issue.number,
        reason: { kind: "claimedByPR", pr: claimingPR },
      });
      continue;
    }
    eligible.push(
      Issue.parse({
        number: issue.number,
        title: issue.title,
        branch: makeBranch(issue.number, issue.title),
        labels: issue.labels.map((l) => l.name),
      }),
    );
  }

  return { eligible, needsPlanner: eligible.length > 1, excluded };
}

export type ReconciliationResult =
  | { eligible: true }
  | { eligible: false; reason: ReconciliationReason };

export type ReconciliationReason =
  | { kind: "issueClosed" }
  | { kind: "labelRemoved" }
  | { kind: "claimedByPR"; pr: number };

// Re-check between iteration plan and per-issue dispatch (B.2). Reuses the
// same predicates so behaviour stays consistent: an issue that pickEligible
// would reject now is also rejected here.
export function checkStillEligible(
  issue: IssueT,
  liveState: IssueLiveState,
  openPRs: OpenPRClosing[],
  config: EligibilityConfig,
): ReconciliationResult {
  if (liveState.state === "closed") {
    return { eligible: false, reason: { kind: "issueClosed" } };
  }
  if (!hasLabel(liveState, config.label)) {
    return { eligible: false, reason: { kind: "labelRemoved" } };
  }
  const claimingPR = findClaimingPR(issue.number, openPRs);
  if (claimingPR !== undefined) {
    return { eligible: false, reason: { kind: "claimedByPR", pr: claimingPR } };
  }
  return { eligible: true };
}
