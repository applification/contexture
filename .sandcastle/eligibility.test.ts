import { describe, expect, test } from "bun:test";
import { checkStillEligible, makeBranch, pickEligible } from "./eligibility";
import type { OpenPRClosing, IssueLiveState, RawIssue } from "./gh";
import type { Issue } from "./plan";

const cfg = { label: "Sandcastle" };

const rawIssue = (overrides: Partial<RawIssue> = {}): RawIssue => ({
  number: 42,
  title: "Fix auth bug",
  labels: [{ name: "Sandcastle" }],
  ...overrides,
});

const fullIssue = (overrides: Partial<Issue> = {}): Issue => ({
  number: 42,
  title: "Fix auth bug",
  branch: "sandcastle/issue-42-fix-auth-bug",
  labels: ["Sandcastle"],
  ...overrides,
});

describe("makeBranch", () => {
  test("derives a kebab slug from a normal title", () => {
    expect(makeBranch(42, "Fix auth bug")).toBe("sandcastle/issue-42-fix-auth-bug");
  });

  test("is idempotent — re-slugifying an already-slug title produces the same branch", () => {
    const slug = "fix-auth-bug";
    expect(makeBranch(7, slug)).toBe(`sandcastle/issue-7-${slug}`);
    expect(makeBranch(7, slug)).toBe(makeBranch(7, slug));
  });

  test("strips punctuation and collapses repeated separators", () => {
    expect(makeBranch(1, "Hello, world!! again")).toBe("sandcastle/issue-1-hello-world-again");
  });

  test("falls back to 'untitled' when slugify returns empty", () => {
    expect(makeBranch(9, "🚀🎉")).toBe("sandcastle/issue-9-untitled");
  });

  test("truncates very long titles so the branch stays under the 200 cap", () => {
    const long = "word ".repeat(200);
    const branch = makeBranch(123, long);
    expect(branch.length).toBeLessThanOrEqual(200);
    expect(branch.startsWith("sandcastle/issue-123-")).toBe(true);
  });

  test("handles unicode by transliterating to ascii where slugify supports it", () => {
    const branch = makeBranch(5, "Café résumé");
    expect(branch).toBe("sandcastle/issue-5-cafe-resume");
  });
});

describe("pickEligible", () => {
  test("returns a single eligible issue with needsPlanner=false", () => {
    const result = pickEligible([rawIssue()], [], cfg);
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]?.branch).toBe("sandcastle/issue-42-fix-auth-bug");
    expect(result.needsPlanner).toBe(false);
    expect(result.excluded).toEqual([]);
  });

  test("with 2+ eligible issues, needsPlanner=true", () => {
    const issues = [rawIssue({ number: 1, title: "first" }), rawIssue({ number: 2, title: "second" })];
    const result = pickEligible(issues, [], cfg);
    expect(result.eligible).toHaveLength(2);
    expect(result.needsPlanner).toBe(true);
  });

  test("excludes issues missing the tracker label", () => {
    const issue = rawIssue({ number: 99, labels: [{ name: "bug" }] });
    const result = pickEligible([issue], [], cfg);
    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([{ number: 99, reason: { kind: "missingLabel" } }]);
  });

  test("excludes issues claimed by an open PR via Closes #N", () => {
    const issue = rawIssue({ number: 42 });
    const openPRs: OpenPRClosing[] = [{ pr: 200, closes: [42] }];
    const result = pickEligible([issue], openPRs, cfg);
    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([
      { number: 42, reason: { kind: "claimedByPR", pr: 200 } },
    ]);
  });

  test("an open PR closing a different issue does not exclude #42", () => {
    const issue = rawIssue({ number: 42 });
    const openPRs: OpenPRClosing[] = [{ pr: 200, closes: [99] }];
    const result = pickEligible([issue], openPRs, cfg);
    expect(result.eligible).toHaveLength(1);
  });

  test("mix of eligible and excluded issues — eligible count drives needsPlanner", () => {
    const issues = [
      rawIssue({ number: 1, title: "kept" }),
      rawIssue({ number: 2, title: "no-label", labels: [{ name: "bug" }] }),
      rawIssue({ number: 3, title: "claimed" }),
    ];
    const openPRs: OpenPRClosing[] = [{ pr: 50, closes: [3] }];
    const result = pickEligible(issues, openPRs, cfg);
    expect(result.eligible.map((i) => i.number)).toEqual([1]);
    expect(result.needsPlanner).toBe(false);
    expect(result.excluded).toHaveLength(2);
  });

  test("returned issues are validated against the plan.ts Issue schema (branch matches regex)", () => {
    const result = pickEligible([rawIssue({ title: "Test  it" })], [], cfg);
    const branch = result.eligible[0]?.branch ?? "";
    expect(branch).toMatch(/^sandcastle\/issue-\d+-[a-z0-9._-]+$/);
  });
});

describe("checkStillEligible", () => {
  const issue = fullIssue();

  test("returns eligible for an open, labelled, unclaimed issue", () => {
    const live: IssueLiveState = { state: "open", labels: [{ name: "Sandcastle" }] };
    expect(checkStillEligible(issue, live, [], cfg)).toEqual({ eligible: true });
  });

  test("rejects a closed issue", () => {
    const live: IssueLiveState = { state: "closed", labels: [{ name: "Sandcastle" }] };
    expect(checkStillEligible(issue, live, [], cfg)).toEqual({
      eligible: false,
      reason: { kind: "issueClosed" },
    });
  });

  test("rejects when the tracker label was removed", () => {
    const live: IssueLiveState = { state: "open", labels: [{ name: "bug" }] };
    expect(checkStillEligible(issue, live, [], cfg)).toEqual({
      eligible: false,
      reason: { kind: "labelRemoved" },
    });
  });

  test("rejects when an open PR now claims the issue", () => {
    const live: IssueLiveState = { state: "open", labels: [{ name: "Sandcastle" }] };
    const openPRs: OpenPRClosing[] = [{ pr: 200, closes: [42] }];
    expect(checkStillEligible(issue, live, openPRs, cfg)).toEqual({
      eligible: false,
      reason: { kind: "claimedByPR", pr: 200 },
    });
  });

  test("closed-state precedes label-removed when both are true (deterministic order)", () => {
    const live: IssueLiveState = { state: "closed", labels: [] };
    expect(checkStillEligible(issue, live, [], cfg)).toEqual({
      eligible: false,
      reason: { kind: "issueClosed" },
    });
  });
});
