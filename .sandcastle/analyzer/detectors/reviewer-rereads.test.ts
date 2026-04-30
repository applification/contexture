import { describe, expect, test } from "bun:test";
import { reviewerReReads } from "./reviewer-rereads";
import type { Event } from "./types";

const tool = (overrides: Partial<Extract<Event, { type: "tool" }>>): Event => ({
  type: "tool",
  runId: "r1",
  name: "iter1-implementer-42",
  iter: 1,
  t: "2026-04-30T12:00:00Z",
  tool: "Read",
  args: "/foo.ts",
  ...overrides,
});

describe("reviewerReReads (C8)", () => {
  test("flags reviewer Reads of paths the implementer wrote", () => {
    const events: Event[] = [
      tool({ name: "iter1-implementer-42", tool: "Edit", args: "/apps/web/src/auth.ts" }),
      tool({ name: "iter1-implementer-42", tool: "Write", args: "/apps/web/src/auth.test.ts" }),
      tool({ name: "iter1-reviewer-42", tool: "Read", args: "/apps/web/src/auth.ts", t: "2026-04-30T12:01:00Z" }),
      tool({ name: "iter1-reviewer-42", tool: "Read", args: "/apps/web/src/auth.test.ts", t: "2026-04-30T12:01:05Z" }),
    ];
    const findings = reviewerReReads.run(events);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.wastedToolCalls).toBe(2);
    expect(findings[0]?.issueNumber).toBe(42);
  });

  test("does not flag reviewer reading a path the implementer never touched", () => {
    const events: Event[] = [
      tool({ name: "iter1-implementer-42", tool: "Edit", args: "/a.ts" }),
      tool({ name: "iter1-reviewer-42", tool: "Read", args: "/b.ts" }),
    ];
    expect(reviewerReReads.run(events)).toHaveLength(0);
  });

  test("scopes by issue (reviewer for #43 should not match implementer #42)", () => {
    const events: Event[] = [
      tool({ name: "iter1-implementer-42", tool: "Edit", args: "/shared.ts" }),
      tool({ name: "iter1-reviewer-43", tool: "Read", args: "/shared.ts" }),
    ];
    expect(reviewerReReads.run(events)).toHaveLength(0);
  });
});
