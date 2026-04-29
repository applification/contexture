import { z } from "zod";

// gh CLI shapes. We Zod-validate at the boundary: gh's output is technically
// untrusted (a malicious branch name in a label or PR body shouldn't slip
// through and reach pickEligible() unchecked). Schemas are deliberately
// narrower than gh's full JSON — we accept the fields we use.

const RawIssue = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  labels: z.array(z.object({ name: z.string() })),
});
export type RawIssue = z.infer<typeof RawIssue>;

const IssueListSchema = z.array(RawIssue);

const PRBodyEntry = z.object({
  number: z.number().int().positive(),
  body: z.string().nullable(),
});
const PRListSchema = z.array(PRBodyEntry);

// PRs declare which issues they close via `Closes #N` / `Fixes #N` /
// `Resolves #N` (case-insensitive, optional past tense). Same regex the
// planner prompt was using, lifted into TypeScript.
const CLOSES_PATTERN = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

export type OpenPRClosing = { pr: number; closes: number[] };

function extractClosingNumbers(body: string | null): number[] {
  if (body === null) return [];
  const numbers = new Set<number>();
  for (const match of body.matchAll(CLOSES_PATTERN)) {
    const n = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(n) && n > 0) numbers.add(n);
  }
  return [...numbers];
}

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

// Fetch open issues carrying the harness's tracker label. Fields kept narrow
// — pickEligible() needs only number/title/labels.
export async function fetchOpenLabelledIssues(label: string): Promise<RawIssue[]> {
  const raw = await ghJson([
    "issue",
    "list",
    "--state",
    "open",
    "--label",
    label,
    "--json",
    "number,title,labels",
  ]);
  return IssueListSchema.parse(raw);
}

// Fetch every open PR and extract the issue numbers each one closes via its
// body. We don't filter PRs by tracker label — a PR opened against any
// Sandcastle issue still claims that issue.
export async function fetchOpenPRsClosingIssues(): Promise<OpenPRClosing[]> {
  const raw = await ghJson(["pr", "list", "--state", "open", "--json", "number,body"]);
  const prs = PRListSchema.parse(raw);
  return prs.map((pr) => ({ pr: pr.number, closes: extractClosingNumbers(pr.body) }));
}

// Single-issue live state probe used by reconciliation-lite (B.2).
const IssueStateSchema = z.object({
  state: z.enum(["OPEN", "CLOSED", "open", "closed"]).transform((s) => s.toLowerCase() as "open" | "closed"),
  labels: z.array(z.object({ name: z.string() })),
});
export type IssueLiveState = z.infer<typeof IssueStateSchema>;

export async function fetchIssueLiveState(issueNumber: number): Promise<IssueLiveState> {
  const raw = await ghJson([
    "issue",
    "view",
    String(issueNumber),
    "--json",
    "state,labels",
  ]);
  return IssueStateSchema.parse(raw);
}

// Re-export helpers for tests.
export const __test__ = { extractClosingNumbers, IssueListSchema, PRListSchema, IssueStateSchema };
