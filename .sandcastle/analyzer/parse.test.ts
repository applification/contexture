import { describe, expect, test } from "bun:test";
import {
  groupByAgentRun,
  groupByIssue,
  groupByRun,
  inferIssueFromLogName,
  parseStreamLogText,
} from "./parse";

const line = (obj: object) => JSON.stringify(obj);

describe("parseStreamLogText", () => {
  test("parses well-formed lines and skips garbage", () => {
    const text = [
      line({ type: "run_start", runId: "r1", t: "2026-04-30T12:00:00Z" }),
      "not json",
      line({ type: "text", runId: "r1", name: "iter1-implementer-42", iter: 1, t: "x", text: "hi" }),
      "",
      line({ type: "tool", runId: "r1", name: "iter1-implementer-42", iter: 1, t: "x", tool: "Read", args: "a" }),
    ].join("\n");
    const events = parseStreamLogText(text);
    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe("run_start");
    expect(events[1]?.type).toBe("text");
    expect(events[2]?.type).toBe("tool");
  });

  test("rejects unknown event types", () => {
    const text = line({ type: "weird", runId: "r1" });
    expect(parseStreamLogText(text)).toEqual([]);
  });
});

describe("groupByRun", () => {
  test("groups by runId and captures startedAt from run_start", () => {
    const events = parseStreamLogText(
      [
        line({ type: "run_start", runId: "r1", t: "2026-04-30T12:00:00Z" }),
        line({ type: "tool", runId: "r1", name: "n", iter: 1, t: "x", tool: "Read", args: "" }),
        line({ type: "run_start", runId: "r2", t: "2026-04-30T13:00:00Z" }),
        line({ type: "tool", runId: "r2", name: "n", iter: 1, t: "x", tool: "Read", args: "" }),
      ].join("\n"),
    );
    const runs = groupByRun(events);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.startedAt).toBe("2026-04-30T12:00:00Z");
    expect(runs[1]?.startedAt).toBe("2026-04-30T13:00:00Z");
  });

  test("buckets events without runId into 'legacy'", () => {
    const events = parseStreamLogText(
      // legacy line with no runId field
      [line({ type: "tool", name: "n", iter: 1, t: "x", tool: "Read", args: "" })].join("\n"),
    );
    const runs = groupByRun(events);
    expect(runs[0]?.runId).toBe("legacy");
  });
});

describe("groupByAgentRun", () => {
  test("groups by name and excludes run_start", () => {
    const events = parseStreamLogText(
      [
        line({ type: "run_start", runId: "r1", t: "x" }),
        line({ type: "tool", runId: "r1", name: "iter1-implementer-42", iter: 1, t: "x", tool: "Read", args: "" }),
        line({ type: "tool", runId: "r1", name: "iter1-reviewer-42", iter: 1, t: "x", tool: "Read", args: "" }),
        line({ type: "tool", runId: "r1", name: "iter1-implementer-42", iter: 1, t: "x", tool: "Edit", args: "" }),
      ].join("\n"),
    );
    const byAgent = groupByAgentRun(events);
    expect(byAgent.size).toBe(2);
    expect(byAgent.get("iter1-implementer-42")).toHaveLength(2);
  });
});

describe("inferIssueFromLogName", () => {
  test("extracts trailing number", () => {
    expect(inferIssueFromLogName("iter3-implementer-42")).toBe(42);
    expect(inferIssueFromLogName("iter1-pr-99")).toBe(99);
  });
  test("returns undefined when no number", () => {
    expect(inferIssueFromLogName("nope")).toBeUndefined();
  });
});

describe("groupByIssue", () => {
  test("collects all phases for an issue under one key", () => {
    const events = parseStreamLogText(
      [
        line({ type: "tool", runId: "r1", name: "iter1-implementer-42", iter: 1, t: "x", tool: "Read", args: "" }),
        line({ type: "tool", runId: "r1", name: "iter1-reviewer-42", iter: 1, t: "x", tool: "Read", args: "" }),
        line({ type: "tool", runId: "r1", name: "iter1-pr-42", iter: 1, t: "x", tool: "Bash", args: "" }),
      ].join("\n"),
    );
    const byIssue = groupByIssue(groupByAgentRun(events));
    expect(byIssue.get(42)?.size).toBe(3);
  });
});
