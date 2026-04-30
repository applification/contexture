import { describe, expect, test } from "bun:test";
import { bashInsteadOfDedicated } from "./bash-instead-of-dedicated";
import type { Event } from "./types";

const tool = (overrides: Partial<Extract<Event, { type: "tool" }>>): Event => ({
  type: "tool",
  runId: "r1",
  name: "iter1-implementer-42",
  iter: 1,
  t: "2026-04-30T12:00:00Z",
  tool: "Bash",
  args: "cat foo.ts",
  ...overrides,
});

describe("bashInsteadOfDedicated (A4)", () => {
  test("flags cat / head / tail / grep / find / ls", () => {
    const cmds = ["cat a", "head -20 b", "tail -f c", "grep foo .", "rg foo", "find . -name", "ls src/"];
    const events: Event[] = cmds.map((c, i) =>
      tool({ args: c, t: `2026-04-30T12:00:${String(i).padStart(2, "0")}Z` }),
    );
    const findings = bashInsteadOfDedicated.run(events);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.wastedToolCalls).toBe(7);
  });

  test("does not flag other Bash uses", () => {
    const events: Event[] = [tool({ args: "bun install" }), tool({ args: "git status" })];
    expect(bashInsteadOfDedicated.run(events)).toHaveLength(0);
  });

  test("does not flag non-Bash tool calls", () => {
    const events: Event[] = [tool({ tool: "Read", args: "/foo.ts" })];
    expect(bashInsteadOfDedicated.run(events)).toHaveLength(0);
  });

  test("groups per agent", () => {
    const events: Event[] = [
      tool({ name: "iter1-implementer-42", args: "cat a" }),
      tool({ name: "iter1-reviewer-42", args: "cat b" }),
    ];
    const findings = bashInsteadOfDedicated.run(events);
    expect(findings).toHaveLength(2);
  });
});
