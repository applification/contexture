import { describe, expect, test } from "bun:test";
import { emptyBaseline, runOutlier, updateBaseline } from "./run-outlier";
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

// Build an agent run with `count` reads over `durationSec` seconds.
function agentRun(name: string, count: number, durationSec: number): Event[] {
  const start = Date.parse("2026-04-30T12:00:00Z");
  return Array.from({ length: count }, (_, i) =>
    tool({
      name,
      args: `/f${i}.ts`,
      t: new Date(start + (durationSec * 1000 * i) / Math.max(1, count - 1)).toISOString(),
    }),
  );
}

describe("runOutlier (E12)", () => {
  test("returns no findings when baseline is too small", () => {
    const baseline = updateBaseline(emptyBaseline(), agentRun("iter1-implementer-1", 30, 60));
    const events = agentRun("iter2-implementer-2", 100, 600);
    expect(runOutlier(events, baseline)).toHaveLength(0);
  });

  test("flags a run >2σ above the historical mean", () => {
    let baseline = emptyBaseline();
    // Vary both tool count and duration so we have real variance.
    const sizes = [8, 10, 12, 9, 11, 10, 13, 8, 11, 9];
    for (let i = 0; i < sizes.length; i++) {
      baseline = updateBaseline(
        baseline,
        agentRun(`iter${i}-implementer-${i}`, sizes[i] ?? 10, 60 + (sizes[i] ?? 10) * 2),
      );
    }
    const outlier = agentRun("iterN-implementer-99", 100, 600);
    const findings = runOutlier(outlier, baseline);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detector).toBe("E12-run-outlier");
  });

  test("does not flag runs near the mean", () => {
    let baseline = emptyBaseline();
    const sizes = [8, 10, 12, 9, 11, 10, 13, 8, 11, 9];
    for (let i = 0; i < sizes.length; i++) {
      baseline = updateBaseline(
        baseline,
        agentRun(`iter${i}-implementer-${i}`, sizes[i] ?? 10, 60 + (sizes[i] ?? 10) * 2),
      );
    }
    const normal = agentRun("iterN-implementer-99", 11, 80);
    expect(runOutlier(normal, baseline)).toHaveLength(0);
  });
});
