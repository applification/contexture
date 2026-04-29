import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { AGENTS, LABEL, MAX_ITERATIONS, MAX_PARALLEL } from "./workflow";

describe("workflow config", () => {
  test("AGENTS exposes all five expected keys", () => {
    expect(Object.keys(AGENTS).sort()).toEqual(
      ["implementer", "implementerDocs", "prOpener", "reviewer", "subsetSelector"].sort(),
    );
  });

  test("every agent has a known provider, non-empty model, and a resolvable promptPath", () => {
    const validProviders = new Set(["claudeCode", "codex", "opencode", "pi"]);
    for (const [key, spec] of Object.entries(AGENTS)) {
      expect(validProviders.has(spec.provider), `${key}.provider must be a known backend`).toBe(
        true,
      );
      expect(spec.model.length, `${key}.model must be non-empty`).toBeGreaterThan(0);
      expect(existsSync(spec.promptPath), `${key}.promptPath ${spec.promptPath} must resolve`).toBe(
        true,
      );
    }
  });

  test("LABEL is non-empty", () => {
    expect(LABEL.length).toBeGreaterThan(0);
  });

  test("MAX_ITERATIONS and MAX_PARALLEL are positive integers", () => {
    expect(Number.isInteger(MAX_ITERATIONS)).toBe(true);
    expect(MAX_ITERATIONS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_PARALLEL)).toBe(true);
    expect(MAX_PARALLEL).toBeGreaterThan(0);
  });

  test("select-subset-prompt.md references the placeholders main.ts injects", () => {
    const content = readFileSync(AGENTS.subsetSelector.promptPath, "utf8");
    expect(content).toContain("{{LABEL}}");
    expect(content).toContain("{{MAX_PARALLEL}}");
    expect(content).toContain("{{CANDIDATES_JSON}}");
  });
});
