import { describe, expect, test } from "bun:test";
import type { Finding } from "./detectors/types";
import { renderReport } from "./report";

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  detector: "A1-redundant-tool-call",
  agentName: "iter1-implementer-42",
  message: "Read called 3× with identical args",
  evidence: "args: /foo.ts",
  wastedToolCalls: 2,
  wastedSeconds: 20,
  suggestedFix: "Cache it.",
  source: "deterministic",
  ...overrides,
});

describe("renderReport", () => {
  test("includes summary, biggest win, and per-issue sections", () => {
    const out = renderReport({
      runId: "r1",
      events: [],
      findings: [finding(), finding({ message: "Other thing", wastedToolCalls: 5 })],
      generatedAt: "2026-04-30T13:00:00Z",
    });
    expect(out).toContain("# Sandcastle harness analysis");
    expect(out).toContain("Run: `r1`");
    expect(out).toContain("Biggest win:");
    expect(out).toContain("Other thing");
    expect(out).toContain("## Issue #42");
    expect(out).toContain("### Implementer");
  });

  test("ranks findings within a phase by cost (desc)", () => {
    const out = renderReport({
      runId: "r1",
      events: [],
      findings: [
        finding({ message: "Cheap", wastedToolCalls: 1 }),
        finding({ message: "Expensive", wastedToolCalls: 10 }),
      ],
      generatedAt: "2026-04-30T13:00:00Z",
    });
    const expensiveIdx = out.indexOf("Expensive");
    const cheapIdx = out.indexOf("Cheap");
    expect(expensiveIdx).toBeGreaterThan(-1);
    expect(expensiveIdx).toBeLessThan(cheapIdx);
  });

  test("groups by issue and orders implementer → reviewer → pr-opener", () => {
    const out = renderReport({
      runId: "r1",
      events: [],
      findings: [
        finding({ agentName: "iter1-pr-42", message: "PR thing" }),
        finding({ agentName: "iter1-implementer-42", message: "Impl thing" }),
        finding({ agentName: "iter1-reviewer-42", message: "Rev thing" }),
      ],
      generatedAt: "2026-04-30T13:00:00Z",
    });
    const implIdx = out.indexOf("### Implementer");
    const revIdx = out.indexOf("### Reviewer");
    const prIdx = out.indexOf("### Pr-opener");
    expect(implIdx).toBeGreaterThan(-1);
    expect(implIdx).toBeLessThan(revIdx);
    expect(revIdx).toBeLessThan(prIdx);
  });

  test("clean run produces a 'no findings' note", () => {
    const out = renderReport({
      runId: "r1",
      events: [],
      findings: [],
      generatedAt: "2026-04-30T13:00:00Z",
    });
    expect(out).toContain("No findings");
  });

  test("includes per-phase usage line when usage events present", () => {
    const out = renderReport({
      runId: "r1",
      events: [
        {
          type: "usage",
          runId: "r1",
          name: "iter1-implementer-42",
          iter: 1,
          subIter: 1,
          t: "x",
          inputTokens: 1000,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 5000,
          outputTokens: 200,
        },
      ],
      findings: [finding()],
      generatedAt: "2026-04-30T13:00:00Z",
    });
    expect(out).toContain("Usage:");
    expect(out).toContain("Tokens this run:");
  });
});
