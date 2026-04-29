import { IssueListSchema, IssueSnapshotSchema, PRListSchema, prListToClosing } from "./gh-parse";
import type { IssueSnapshot, OpenPRClosing } from "./gh-parse";

// Adapter to the `gh` CLI. Spawns the binary, parses its JSON output, and
// hands the raw shape to gh-parse.ts for Zod validation. Everything testable
// (regexes, schemas, body parsing) lives in gh-parse.ts; this file only owns
// the spawn-and-decode seam.

export type { IssueSnapshot, OpenPRClosing } from "./gh-parse";

async function ghJson(args: string[]): Promise<unknown> {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(`gh ${args.join(" ")} exited ${proc.exitCode}: ${stderr.trim()}`);
  }
  return JSON.parse(stdout);
}

// Fetch open issues carrying the harness's tracker label.
export async function fetchOpenLabelledIssues(label: string): Promise<IssueSnapshot[]> {
  const raw = await ghJson([
    "issue",
    "list",
    "--state",
    "open",
    "--label",
    label,
    "--json",
    "number,title,state,labels",
  ]);
  return IssueListSchema.parse(raw);
}

// Fetch every open PR and extract the issue numbers each one closes via its
// body. We don't filter PRs by tracker label — a PR opened against any
// Sandcastle issue still claims that issue.
export async function fetchOpenPRsClosingIssues(): Promise<OpenPRClosing[]> {
  const raw = await ghJson(["pr", "list", "--state", "open", "--json", "number,body"]);
  return prListToClosing(PRListSchema.parse(raw));
}

// Single-issue live state probe used by reconciliation.
export async function fetchIssueLiveState(issueNumber: number): Promise<IssueSnapshot> {
  const raw = await ghJson([
    "issue",
    "view",
    String(issueNumber),
    "--json",
    "number,title,state,labels",
  ]);
  return IssueSnapshotSchema.parse(raw);
}
