import type { IssueSnapshot, OpenPRClosing } from "./gh";
import { Issue, makeBranch } from "./plan";
import type { Issue as IssueT } from "./plan";

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
  // True when more than one candidate survives. The orchestrator dispatches a
  // subset-selection agent only in that case; a single eligible issue is
  // dispatched directly without an LLM round-trip.
  needsPlanner: boolean;
  excluded: Array<{ number: number; reason: ExclusionReason }>;
};

// Iteration-start partition: applies `evaluate` to every snapshot, mints
// branch names for survivors, validates them through plan.ts's Issue schema.
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

  return { eligible, needsPlanner: eligible.length > 1, excluded };
}
