import { describe, expect, test } from "bun:test";
import { Issue, makeBranch } from "./issue";

describe("makeBranch", () => {
  test("derives a kebab slug from a normal title", () => {
    expect(makeBranch(42, "Fix auth bug")).toBe("sandcastle/issue-42-fix-auth-bug");
  });

  test("is idempotent — re-slugifying an already-slug title produces the same branch", () => {
    const slug = "fix-auth-bug";
    expect(makeBranch(7, slug)).toBe(`sandcastle/issue-7-${slug}`);
    expect(makeBranch(7, slug)).toBe(makeBranch(7, slug));
  });

  test("strips punctuation and collapses repeated separators", () => {
    expect(makeBranch(1, "Hello, world!! again")).toBe("sandcastle/issue-1-hello-world-again");
  });

  test("falls back to 'untitled' when slugify returns empty", () => {
    expect(makeBranch(9, "🚀🎉")).toBe("sandcastle/issue-9-untitled");
  });

  test("truncates very long titles so the branch stays under the 200 cap", () => {
    const long = "word ".repeat(200);
    const branch = makeBranch(123, long);
    expect(branch.length).toBeLessThanOrEqual(200);
    expect(branch.startsWith("sandcastle/issue-123-")).toBe(true);
  });

  test("handles unicode by transliterating to ascii where slugify supports it", () => {
    const branch = makeBranch(5, "Café résumé");
    expect(branch).toBe("sandcastle/issue-5-cafe-resume");
  });

  test("emits branches that match the schema's BRANCH_REGEX", () => {
    const branch = makeBranch(1, "Whatever it is");
    const ok = Issue.parse({ number: 1, title: "Whatever it is", branch, labels: [] });
    expect(ok.branch).toBe(branch);
  });
});
