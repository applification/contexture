import { describe, expect, test } from "bun:test";
import { redundantToolCall } from "./redundant-tool-call";
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

describe("redundantToolCall (A1)", () => {
  test("flags identical (tool, args) pairs and reports one wasted call per repeat", () => {
    const events: Event[] = [
      tool({ t: "2026-04-30T12:00:00Z" }),
      tool({ t: "2026-04-30T12:00:10Z" }),
      tool({ t: "2026-04-30T12:00:20Z" }),
    ];
    const findings = redundantToolCall.run(events);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.wastedToolCalls).toBe(2);
    expect(findings[0]?.message).toContain("Read called 3×");
  });

  test("does not flag distinct args", () => {
    const events: Event[] = [
      tool({ args: "/a.ts" }),
      tool({ args: "/b.ts" }),
    ];
    expect(redundantToolCall.run(events)).toHaveLength(0);
  });

  test("groups per agent — no false positive across agent runs", () => {
    const events: Event[] = [
      tool({ name: "iter1-implementer-42", args: "/foo.ts" }),
      tool({ name: "iter1-reviewer-42", args: "/foo.ts" }),
    ];
    expect(redundantToolCall.run(events)).toHaveLength(0);
  });

  test("estimates wasted seconds from the average inter-tool gap", () => {
    const events: Event[] = [
      tool({ t: "2026-04-30T12:00:00Z" }),
      tool({ t: "2026-04-30T12:00:10Z" }),
      tool({ t: "2026-04-30T12:00:20Z" }),
    ];
    const findings = redundantToolCall.run(events);
    expect(findings[0]?.wastedSeconds).toBe(20);
  });
});
