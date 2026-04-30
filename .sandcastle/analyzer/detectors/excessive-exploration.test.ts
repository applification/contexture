import { describe, expect, test } from "bun:test";
import { excessiveExploration } from "./excessive-exploration";
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

describe("excessiveExploration (B6)", () => {
  test("flags >12 reads before first edit", () => {
    const reads: Event[] = Array.from({ length: 15 }, (_, i) =>
      tool({ tool: "Read", args: `/f${i}.ts`, t: `2026-04-30T12:00:${String(i).padStart(2, "0")}Z` }),
    );
    const events: Event[] = [...reads, tool({ tool: "Edit", args: "x", t: "2026-04-30T12:01:00Z" })];
    const findings = excessiveExploration.run(events);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.wastedToolCalls).toBe(3);
  });

  test("does not flag modest exploration", () => {
    const reads: Event[] = Array.from({ length: 5 }, (_, i) =>
      tool({ args: `/f${i}.ts`, t: `2026-04-30T12:00:${String(i).padStart(2, "0")}Z` }),
    );
    expect(excessiveExploration.run(reads)).toHaveLength(0);
  });

  test("counts all reads when no write ever happens", () => {
    const reads: Event[] = Array.from({ length: 20 }, (_, i) =>
      tool({ args: `/f${i}.ts`, t: `2026-04-30T12:00:${String(i).padStart(2, "0")}Z` }),
    );
    const findings = excessiveExploration.run(reads);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.wastedToolCalls).toBe(8);
  });

  test("ignores PR-opener (not an editing role for our purposes)", () => {
    const reads: Event[] = Array.from({ length: 20 }, (_, i) =>
      tool({ name: "iter1-pr-42", args: `/f${i}.ts`, t: `2026-04-30T12:00:${String(i).padStart(2, "0")}Z` }),
    );
    expect(excessiveExploration.run(reads)).toHaveLength(0);
  });
});
