import { describe, expect, test } from "bun:test";
import { parsePlan } from "./plan";

const wrap = (json: string) => `prelude\n<plan>${json}</plan>\nepilogue`;

const validIssue = {
  number: 42,
  title: "Fix auth bug",
  branch: "sandcastle/issue-42-fix-auth-bug",
  labels: ["bug", "Sandcastle"],
};

describe("parsePlan", () => {
  test("accepts a well-formed plan", () => {
    const plan = parsePlan(wrap(JSON.stringify({ issues: [validIssue] })));
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]?.number).toBe(42);
  });

  test("rejects a path-traversal branch", () => {
    const bad = { ...validIssue, branch: "../../etc/passwd" };
    expect(() => parsePlan(wrap(JSON.stringify({ issues: [bad] })))).toThrow();
  });

  test("rejects a branch missing the sandcastle/issue-N- prefix", () => {
    const bad = { ...validIssue, branch: "feat/foo" };
    expect(() => parsePlan(wrap(JSON.stringify({ issues: [bad] })))).toThrow();
  });

  test("rejects a branch over 200 characters", () => {
    const longSlug = "a".repeat(250);
    const bad = { ...validIssue, branch: `sandcastle/issue-42-${longSlug}` };
    expect(() => parsePlan(wrap(JSON.stringify({ issues: [bad] })))).toThrow();
  });

  test("rejects issue number zero", () => {
    const bad = { ...validIssue, number: 0 };
    expect(() => parsePlan(wrap(JSON.stringify({ issues: [bad] })))).toThrow();
  });

  test("rejects negative issue number", () => {
    const bad = { ...validIssue, number: -1 };
    expect(() => parsePlan(wrap(JSON.stringify({ issues: [bad] })))).toThrow();
  });

  test("rejects non-integer issue number", () => {
    const bad = { ...validIssue, number: 1.5 };
    expect(() => parsePlan(wrap(JSON.stringify({ issues: [bad] })))).toThrow();
  });

  test("rejects an empty title", () => {
    const bad = { ...validIssue, title: "" };
    expect(() => parsePlan(wrap(JSON.stringify({ issues: [bad] })))).toThrow();
  });

  test("rejects a missing field", () => {
    const { branch, ...incomplete } = validIssue;
    void branch;
    expect(() => parsePlan(wrap(JSON.stringify({ issues: [incomplete] })))).toThrow();
  });

  test("rejects malformed JSON inside <plan>", () => {
    expect(() => parsePlan("<plan>{not json}</plan>")).toThrow();
  });

  test("rejects output with no <plan> tag", () => {
    expect(() => parsePlan("nothing here")).toThrow(/did not produce a <plan> tag/);
  });

  test("accepts an empty issues array", () => {
    const plan = parsePlan(wrap(JSON.stringify({ issues: [] })));
    expect(plan.issues).toEqual([]);
  });

  test("accepts a branch with allowed slug characters (`.`, `_`, `-`, digits)", () => {
    const ok = { ...validIssue, branch: "sandcastle/issue-7-foo.bar_baz-9" };
    const plan = parsePlan(wrap(JSON.stringify({ issues: [ok] })));
    expect(plan.issues[0]?.branch).toBe("sandcastle/issue-7-foo.bar_baz-9");
  });
});
