import type { IssueSnapshot, OpenPRClosing } from "./github";
import { Issue, makeBranch } from "./issue";
import type { Issue as IssueT } from "./issue";

export type EligibilityConfig = { label: string };

export type ExclusionReason =
  | { kind: "issueClosed" }
  | { kind: "missingLabel" }
  | { kind: "claimedByPR"; pr: number };

export type Verdict =
  | { eligible: true }
  | { eligible: false; reason: ExclusionReason };

// Single eligibility predicate, used at iteration-start (over each candidate
// snapshot) and at per-issue dispatch (over the live snapshot). Checks run in
// a fixed order so the reason returned is stable across call sites.
export function evaluate(
  snapshot: IssueSnapshot,
  openPRs: OpenPRClosing[],
  config: EligibilityConfig,
): Verdict {
  if (snapshot.state === "closed") {
    return { eligible: false, reason: { kind: "issueClosed" } };
  }
  if (!snapshot.labels.includes(config.label)) {
    return { eligible: false, reason: { kind: "missingLabel" } };
  }
  const claimingPR = openPRs.find((p) => p.closes.includes(snapshot.number))?.pr;
  if (claimingPR !== undefined) {
    return { eligible: false, reason: { kind: "claimedByPR", pr: claimingPR } };
  }
  return { eligible: true };
}

export type EligibilityResult = {
  eligible: IssueT[];
  excluded: Array<{ number: number; reason: ExclusionReason }>;
};

// Iteration-start partition: applies `evaluate` to every snapshot, mints
// branch names for survivors, validates them through issue.ts's Issue
// schema. Eligible issues are returned in the same order as the input
// snapshots — callers control ordering by passing snapshots in the order
// they want them processed (e.g. project board drag-order).
export function pickEligible(
  snapshots: IssueSnapshot[],
  openPRs: OpenPRClosing[],
  config: EligibilityConfig,
): EligibilityResult {
  const excluded: EligibilityResult["excluded"] = [];
  const eligible: IssueT[] = [];

  for (const snap of snapshots) {
    const verdict = evaluate(snap, openPRs, config);
    if (!verdict.eligible) {
      excluded.push({ number: snap.number, reason: verdict.reason });
      continue;
    }
    eligible.push(
      Issue.parse({
        number: snap.number,
        title: snap.title,
        branch: makeBranch(snap.number, snap.title),
        labels: snap.labels,
      }),
    );
  }

  return { eligible, excluded };
}
