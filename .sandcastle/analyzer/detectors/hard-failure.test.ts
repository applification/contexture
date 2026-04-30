import { describe, expect, test } from "bun:test";
import { hardFailure } from "./hard-failure";
import type { Event } from "./types";

const text = (overrides: Partial<Extract<Event, { type: "text" }>>): Event => ({
  type: "text",
  runId: "r1",
  name: "iter1-implementer-42",
  iter: 1,
  t: "2026-04-30T12:00:00Z",
  text: "ok",
  ...overrides,
});

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

describe("hardFailure (D10)", () => {
  test("flags an agent that produced text but no tool calls", () => {
    const events: Event[] = [text({ text: "starting up" })];
    const findings = hardFailure.run(events);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("no tool calls");
  });

  test("flags trailing error-tone text", () => {
    const events: Event[] = [tool({}), text({ text: "Encountered an error reading the file" })];
    const findings = hardFailure.run(events);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("error-tone");
  });

  test("does not flag a healthy run", () => {
    const events: Event[] = [tool({}), text({ text: "Done." })];
    expect(hardFailure.run(events)).toHaveLength(0);
  });

  test("does not flag an empty run", () => {
    expect(hardFailure.run([])).toHaveLength(0);
  });
});
