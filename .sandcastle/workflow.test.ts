import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { AGENTS, BRANCH_FORMAT, LABEL, MAX_ITERATIONS, MAX_PARALLEL } from "./workflow";

describe("workflow config", () => {
  test("AGENTS exposes all five expected keys", () => {
    expect(Object.keys(AGENTS).sort()).toEqual(
      ["implementer", "implementerDocs", "planner", "prOpener", "reviewer"].sort(),
    );
  });

  test("every agent has a non-empty model and a resolvable promptPath", () => {
    for (const [key, spec] of Object.entries(AGENTS)) {
      expect(spec.model.length, `${key}.model must be non-empty`).toBeGreaterThan(0);
      expect(existsSync(spec.promptPath), `${key}.promptPath ${spec.promptPath} must resolve`).toBe(
        true,
      );
    }
  });

  test("LABEL and BRANCH_FORMAT are non-empty", () => {
    expect(LABEL.length).toBeGreaterThan(0);
    expect(BRANCH_FORMAT.length).toBeGreaterThan(0);
  });

  test("MAX_ITERATIONS and MAX_PARALLEL are positive integers", () => {
    expect(Number.isInteger(MAX_ITERATIONS)).toBe(true);
    expect(MAX_ITERATIONS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_PARALLEL)).toBe(true);
    expect(MAX_PARALLEL).toBeGreaterThan(0);
  });

  test("plan-prompt.md references {{LABEL}} and {{BRANCH_FORMAT}} placeholders", () => {
    const content = readFileSync(AGENTS.planner.promptPath, "utf8");
    expect(content).toContain("{{LABEL}}");
    expect(content).toContain("{{BRANCH_FORMAT}}");
  });
});
