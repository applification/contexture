import { describe, expect, test } from "bun:test";
import { evaluate, pickEligible } from "./eligibility";
import type { IssueSnapshot, OpenPRClosing } from "./github";

const cfg = { label: "Sandcastle" };

const snapshot = (overrides: Partial<IssueSnapshot> = {}): IssueSnapshot => ({
  number: 42,
  title: "Fix auth bug",
  state: "open",
  labels: ["Sandcastle"],
  ...overrides,
});

describe("evaluate", () => {
  test("eligible for an open, labelled, unclaimed snapshot", () => {
    expect(evaluate(snapshot(), [], cfg)).toEqual({ eligible: true });
  });

  test("rejects a closed issue", () => {
    expect(evaluate(snapshot({ state: "closed" }), [], cfg)).toEqual({
      eligible: false,
      reason: { kind: "issueClosed" },
    });
  });

  test("rejects when the tracker label is missing", () => {
    expect(evaluate(snapshot({ labels: ["bug"] }), [], cfg)).toEqual({
      eligible: false,
      reason: { kind: "missingLabel" },
    });
  });

  test("rejects when an open PR claims the issue", () => {
    const openPRs: OpenPRClosing[] = [{ pr: 200, closes: [42] }];
    expect(evaluate(snapshot(), openPRs, cfg)).toEqual({
      eligible: false,
      reason: { kind: "claimedByPR", pr: 200 },
    });
  });

  test("a PR closing a different issue does not exclude #42", () => {
    const openPRs: OpenPRClosing[] = [{ pr: 200, closes: [99] }];
    expect(evaluate(snapshot(), openPRs, cfg)).toEqual({ eligible: true });
  });

  test("closed-state precedes label-missing when both are true (deterministic order)", () => {
    expect(evaluate(snapshot({ state: "closed", labels: [] }), [], cfg)).toEqual({
      eligible: false,
      reason: { kind: "issueClosed" },
    });
  });

  test("label-missing precedes claimed-by-PR when both are true", () => {
    const openPRs: OpenPRClosing[] = [{ pr: 200, closes: [42] }];
    expect(evaluate(snapshot({ labels: [] }), openPRs, cfg)).toEqual({
      eligible: false,
      reason: { kind: "missingLabel" },
    });
  });
});

describe("pickEligible", () => {
  test("returns a single eligible issue", () => {
    const result = pickEligible([snapshot()], [], cfg);
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]?.branch).toBe("sandcastle/issue-42-fix-auth-bug");
    expect(result.excluded).toEqual([]);
  });

  test("returns eligible issues ordered by issue number ascending", () => {
    const snapshots = [
      snapshot({ number: 5, title: "fifth" }),
      snapshot({ number: 1, title: "first" }),
      snapshot({ number: 3, title: "third" }),
    ];
    const result = pickEligible(snapshots, [], cfg);
    expect(result.eligible.map((i) => i.number)).toEqual([1, 3, 5]);
  });

  test("excludes issues missing the tracker label", () => {
    const result = pickEligible([snapshot({ number: 99, labels: ["bug"] })], [], cfg);
    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([{ number: 99, reason: { kind: "missingLabel" } }]);
  });

  test("excludes issues claimed by an open PR via Closes #N", () => {
    const openPRs: OpenPRClosing[] = [{ pr: 200, closes: [42] }];
    const result = pickEligible([snapshot()], openPRs, cfg);
    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([
      { number: 42, reason: { kind: "claimedByPR", pr: 200 } },
    ]);
  });

  test("mix of eligible and excluded", () => {
    const snapshots = [
      snapshot({ number: 1, title: "kept" }),
      snapshot({ number: 2, title: "no-label", labels: ["bug"] }),
      snapshot({ number: 3, title: "claimed" }),
    ];
    const openPRs: OpenPRClosing[] = [{ pr: 50, closes: [3] }];
    const result = pickEligible(snapshots, openPRs, cfg);
    expect(result.eligible.map((i) => i.number)).toEqual([1]);
    expect(result.excluded).toHaveLength(2);
  });

  test("returned issues are validated against the issue.ts Issue schema (branch matches regex)", () => {
    const result = pickEligible([snapshot({ title: "Test  it" })], [], cfg);
    const branch = result.eligible[0]?.branch ?? "";
    expect(branch).toMatch(/^sandcastle\/issue-\d+-[a-z0-9._-]+$/);
  });
});
