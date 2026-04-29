import { describe, expect, test } from "bun:test";
import { __test__ } from "./gh";

const { extractClosingNumbers, IssueListSchema, PRListSchema, IssueStateSchema } = __test__;

describe("extractClosingNumbers", () => {
  test("matches Closes / Fixes / Resolves with optional past tense, case-insensitive", () => {
    const body = `
      This PR Closes #1, fixes #2, resolved #3, and FIXED #4.
      Also closes #5.
    `;
    expect(extractClosingNumbers(body).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  test("returns an empty array when body is null", () => {
    expect(extractClosingNumbers(null)).toEqual([]);
  });

  test("returns an empty array when body has no closing markers", () => {
    expect(extractClosingNumbers("Just some prose mentioning #99 in passing.")).toEqual([]);
  });

  test("dedupes repeated mentions", () => {
    expect(extractClosingNumbers("Closes #7. Fixes #7. Resolves #7.")).toEqual([7]);
  });

  test("ignores numbers that aren't preceded by a closing keyword", () => {
    expect(extractClosingNumbers("See #42 for context. Closes #43.")).toEqual([43]);
  });
});

describe("IssueListSchema", () => {
  test("accepts well-formed gh issue list output", () => {
    const raw = [
      { number: 1, title: "First", labels: [{ name: "Sandcastle" }] },
      { number: 2, title: "Second", labels: [] },
    ];
    expect(IssueListSchema.parse(raw)).toEqual(raw);
  });

  test("rejects negative issue numbers", () => {
    expect(() =>
      IssueListSchema.parse([{ number: -1, title: "x", labels: [] }]),
    ).toThrow();
  });

  test("rejects missing labels field", () => {
    expect(() => IssueListSchema.parse([{ number: 1, title: "x" }])).toThrow();
  });
});

describe("PRListSchema", () => {
  test("accepts a null body (gh returns null when PR has no description)", () => {
    expect(PRListSchema.parse([{ number: 1, body: null }])).toEqual([{ number: 1, body: null }]);
  });

  test("accepts a string body", () => {
    expect(PRListSchema.parse([{ number: 1, body: "Closes #2" }])).toEqual([
      { number: 1, body: "Closes #2" },
    ]);
  });

  test("rejects a non-string non-null body", () => {
    expect(() => PRListSchema.parse([{ number: 1, body: 42 }])).toThrow();
  });
});

describe("IssueStateSchema", () => {
  test("normalises uppercase state to lowercase", () => {
    expect(IssueStateSchema.parse({ state: "OPEN", labels: [] })).toEqual({
      state: "open",
      labels: [],
    });
    expect(IssueStateSchema.parse({ state: "CLOSED", labels: [{ name: "x" }] })).toEqual({
      state: "closed",
      labels: [{ name: "x" }],
    });
  });

  test("accepts already-lowercase state", () => {
    expect(IssueStateSchema.parse({ state: "open", labels: [] })).toEqual({
      state: "open",
      labels: [],
    });
  });

  test("rejects unknown state values", () => {
    expect(() => IssueStateSchema.parse({ state: "merged", labels: [] })).toThrow();
  });
});
