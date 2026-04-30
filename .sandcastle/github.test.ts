import { describe, expect, test } from "bun:test";
import {
  fetchIssueLiveState,
  fetchOpenLabelledIssues,
  fetchOpenPRsClosingIssues,
  type RunGh,
} from "./github";

const fakeRunGh = (output: string): RunGh => {
  return async () => output;
};

const capturingRunGh = (output: string): { runGh: RunGh; calls: string[][] } => {
  const calls: string[][] = [];
  const runGh: RunGh = async (args) => {
    calls.push(args);
    return output;
  };
  return { runGh, calls };
};

describe("fetchOpenLabelledIssues", () => {
  test("normalises uppercase state and flattens labels", async () => {
    const raw = JSON.stringify([
      { number: 1, title: "First", state: "OPEN", labels: [{ name: "Sandcastle" }] },
      { number: 2, title: "Second", state: "open", labels: [] },
    ]);
    const result = await fetchOpenLabelledIssues("Sandcastle", fakeRunGh(raw));
    expect(result).toEqual([
      { number: 1, title: "First", state: "open", labels: ["Sandcastle"] },
      { number: 2, title: "Second", state: "open", labels: [] },
    ]);
  });

  test("passes label through to gh args", async () => {
    const { runGh, calls } = capturingRunGh("[]");
    await fetchOpenLabelledIssues("Sandcastle", runGh);
    expect(calls).toEqual([
      ["issue", "list", "--state", "open", "--label", "Sandcastle", "--json", "number,title,state,labels"],
    ]);
  });

  test("rejects malformed gh output", async () => {
    const raw = JSON.stringify([{ number: -1, title: "x", state: "open", labels: [] }]);
    await expect(fetchOpenLabelledIssues("Sandcastle", fakeRunGh(raw))).rejects.toThrow();
  });
});

describe("fetchOpenPRsClosingIssues", () => {
  test("extracts Closes / Fixes / Resolves with optional past tense, case-insensitive", async () => {
    const raw = JSON.stringify([
      { number: 100, body: "This PR Closes #1, fixes #2, resolved #3, and FIXED #4. Also closes #5." },
    ]);
    const [entry] = await fetchOpenPRsClosingIssues(fakeRunGh(raw));
    expect(entry?.pr).toBe(100);
    expect(entry?.closes.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  test("returns an empty closes array for a null body", async () => {
    const raw = JSON.stringify([{ number: 101, body: null }]);
    expect(await fetchOpenPRsClosingIssues(fakeRunGh(raw))).toEqual([{ pr: 101, closes: [] }]);
  });

  test("dedupes repeated mentions", async () => {
    const raw = JSON.stringify([{ number: 102, body: "Closes #7. Fixes #7. Resolves #7." }]);
    expect(await fetchOpenPRsClosingIssues(fakeRunGh(raw))).toEqual([{ pr: 102, closes: [7] }]);
  });

  test("ignores numbers not preceded by a closing keyword", async () => {
    const raw = JSON.stringify([{ number: 103, body: "See #42 for context. Closes #43." }]);
    expect(await fetchOpenPRsClosingIssues(fakeRunGh(raw))).toEqual([{ pr: 103, closes: [43] }]);
  });

  test("rejects non-string non-null body", async () => {
    const raw = JSON.stringify([{ number: 104, body: 42 }]);
    await expect(fetchOpenPRsClosingIssues(fakeRunGh(raw))).rejects.toThrow();
  });
});

describe("fetchIssueLiveState", () => {
  test("normalises uppercase CLOSED to lowercase", async () => {
    const raw = JSON.stringify({
      number: 7,
      title: "x",
      state: "CLOSED",
      labels: [{ name: "Sandcastle" }],
    });
    expect(await fetchIssueLiveState(7, fakeRunGh(raw))).toEqual({
      number: 7,
      title: "x",
      state: "closed",
      labels: ["Sandcastle"],
    });
  });

  test("rejects unknown state values", async () => {
    const raw = JSON.stringify({ number: 7, title: "x", state: "merged", labels: [] });
    await expect(fetchIssueLiveState(7, fakeRunGh(raw))).rejects.toThrow();
  });

  test("passes issue number through to gh args", async () => {
    const raw = JSON.stringify({ number: 7, title: "x", state: "open", labels: [] });
    const { runGh, calls } = capturingRunGh(raw);
    await fetchIssueLiveState(7, runGh);
    expect(calls).toEqual([["issue", "view", "7", "--json", "number,title,state,labels"]]);
  });
});
