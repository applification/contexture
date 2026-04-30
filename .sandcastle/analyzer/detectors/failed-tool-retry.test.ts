import { describe, expect, test } from "bun:test";
import { failedToolRetry } from "./failed-tool-retry";
import type { Event } from "./types";

const tool = (overrides: Partial<Extract<Event, { type: "tool" }>>): Event => ({
  type: "tool",
  runId: "r1",
  name: "iter1-implementer-42",
  iter: 1,
  t: "2026-04-30T12:00:00Z",
  tool: "Read",
  args: "/foo/bar.ts",
  ...overrides,
});

describe("failedToolRetry (A3)", () => {
  test("flags two near-identical Reads close in time", () => {
    const events: Event[] = [
      tool({ args: "/foo/bar.ts", t: "2026-04-30T12:00:00Z" }),
      tool({ args: "/foo/baz.ts", t: "2026-04-30T12:00:03Z" }),
    ];
    const findings = failedToolRetry.run(events);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.wastedToolCalls).toBe(1);
  });

  test("ignores very different args even when same tool", () => {
    const events: Event[] = [
      tool({ args: "/apps/web/src/server/auth.ts", t: "2026-04-30T12:00:00Z" }),
      tool({ args: "/packages/stdlib/cli/main.ts", t: "2026-04-30T12:00:03Z" }),
    ];
    expect(failedToolRetry.run(events)).toHaveLength(0);
  });

  test("ignores far-apart calls (outside retry window)", () => {
    const events: Event[] = [
      tool({ args: "/foo/bar.ts", t: "2026-04-30T12:00:00Z" }),
      tool({ args: "/foo/baz.ts", t: "2026-04-30T12:01:00Z" }),
    ];
    expect(failedToolRetry.run(events)).toHaveLength(0);
  });

  test("ignores identical args (that's A1's job)", () => {
    const events: Event[] = [
      tool({ args: "/foo/bar.ts", t: "2026-04-30T12:00:00Z" }),
      tool({ args: "/foo/bar.ts", t: "2026-04-30T12:00:03Z" }),
    ];
    expect(failedToolRetry.run(events)).toHaveLength(0);
  });

  test("ignores when tools differ", () => {
    const events: Event[] = [
      tool({ tool: "Read", args: "/foo.ts", t: "2026-04-30T12:00:00Z" }),
      tool({ tool: "Edit", args: "/foo.ts", t: "2026-04-30T12:00:03Z" }),
    ];
    expect(failedToolRetry.run(events)).toHaveLength(0);
  });
});
