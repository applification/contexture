import { z } from "zod";

// Adapter to the `gh` CLI. Spawns the binary, validates its JSON output, and
// surfaces typed snapshots to the orchestrator. Schemas and the closing-keyword
// regex are file-private; callers see only fetchers and inferred types.
//
// Each fetcher takes a `runGh` seam as its last argument, defaulting to a real
// `gh` subprocess. Tests pass a fake `runGh` that returns canned JSON strings —
// the same surface a caller exercises in production.

export type RunGh = (args: string[]) => Promise<string>;

const defaultRunGh: RunGh = async (args) => {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(`gh ${args.join(" ")} exited ${proc.exitCode}: ${stderr.trim()}`);
  }
  return stdout;
};

const IssueSnapshotSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z
    .enum(["OPEN", "CLOSED", "open", "closed"])
    .transform((s) => s.toLowerCase() as "open" | "closed"),
  labels: z.array(z.object({ name: z.string() })).transform((ls) => ls.map((l) => l.name)),
});
const IssueListSchema = z.array(IssueSnapshotSchema);

// Project items expose the underlying issue under `content` and lift the
// kanban Status column to a top-level `status` string. `repository` is the
// owner/name slug — we filter on it because the project can hold items from
// multiple repos, and Sandcastle only ever wants this repo's issues. `number`
// and `repository` are absent for `DraftIssue` items (project-only cards
// not yet promoted to a real issue), so the schema tolerates that and we
// filter draft items out by `content.type === "Issue"`.
const ProjectItemSchema = z.object({
  status: z.string().optional(),
  labels: z.array(z.string()).optional().default([]),
  content: z.object({
    type: z.string(),
    number: z.number().int().positive().optional(),
    title: z.string(),
    repository: z.string().optional(),
  }),
});
const ProjectItemListSchema = z.object({ items: z.array(ProjectItemSchema) });

const PRBodyEntry = z.object({
  number: z.number().int().positive(),
  body: z.string().nullable(),
});
const PRListSchema = z.array(PRBodyEntry);

// PRs declare which issues they close via `Closes #N` / `Fixes #N` /
// `Resolves #N` (case-insensitive, optional past tense).
const CLOSES_PATTERN = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

export type IssueSnapshot = z.infer<typeof IssueSnapshotSchema>;
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

async function ghJson(runGh: RunGh, args: string[]): Promise<unknown> {
  return JSON.parse(await runGh(args));
}

// Fetch open issues carrying the harness's tracker label.
export async function fetchOpenLabelledIssues(
  label: string,
  runGh: RunGh = defaultRunGh,
): Promise<IssueSnapshot[]> {
  const raw = await ghJson(runGh, [
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

// Fetch issues sitting in the project's `Ready` column for the given repo,
// preserving the board's drag-order. The orchestrator uses this in place of
// `fetchOpenLabelledIssues` so the user's kanban order drives selection. We
// synthesise `state: "open"` because Ready items are by definition open —
// closing an issue moves it out of Ready automatically.
export async function fetchProjectReadyIssues(
  owner: string,
  projectNumber: number,
  repo: string,
  label: string,
  runGh: RunGh = defaultRunGh,
): Promise<IssueSnapshot[]> {
  const raw = await ghJson(runGh, [
    "project",
    "item-list",
    String(projectNumber),
    "--owner",
    owner,
    "--format",
    "json",
    "--limit",
    "200",
  ]);
  const { items } = ProjectItemListSchema.parse(raw);
  const out: IssueSnapshot[] = [];
  for (const item of items) {
    // Filter to Ready issues for this repo with the tracker label. DraftIssue
    // items lack `content.number` and `content.repository`, so the type guard
    // also narrows the optionals to defined values for the push below.
    if (
      item.status !== "Ready" ||
      item.content.type !== "Issue" ||
      item.content.repository !== repo ||
      item.content.number === undefined ||
      !item.labels.includes(label)
    ) {
      continue;
    }
    out.push({
      number: item.content.number,
      title: item.content.title,
      state: "open",
      labels: item.labels,
    });
  }
  return out;
}

// Fetch every open PR and extract the issue numbers each one closes via its
// body. We don't filter PRs by tracker label — a PR opened against any
// Sandcastle issue still claims that issue.
export async function fetchOpenPRsClosingIssues(
  runGh: RunGh = defaultRunGh,
): Promise<OpenPRClosing[]> {
  const raw = await ghJson(runGh, ["pr", "list", "--state", "open", "--json", "number,body"]);
  return PRListSchema.parse(raw).map((pr) => ({
    pr: pr.number,
    closes: extractClosingNumbers(pr.body),
  }));
}

// Single-issue live state probe used by reconciliation.
export async function fetchIssueLiveState(
  issueNumber: number,
  runGh: RunGh = defaultRunGh,
): Promise<IssueSnapshot> {
  const raw = await ghJson(runGh, [
    "issue",
    "view",
    String(issueNumber),
    "--json",
    "number,title,state,labels",
  ]);
  return IssueSnapshotSchema.parse(raw);
}
