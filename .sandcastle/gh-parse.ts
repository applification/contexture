import { z } from "zod";

// Zod schemas for the boundary between gh CLI output and the rest of the
// orchestrator. gh's JSON output is technically untrusted (a malicious branch
// name in a label or PR body shouldn't slip through unchecked). Schemas are
// deliberately narrower than gh's full JSON — we accept the fields we use.

export const IssueSnapshotSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z
    .enum(["OPEN", "CLOSED", "open", "closed"])
    .transform((s) => s.toLowerCase() as "open" | "closed"),
  labels: z.array(z.object({ name: z.string() })).transform((ls) => ls.map((l) => l.name)),
});
export type IssueSnapshot = z.infer<typeof IssueSnapshotSchema>;

export const IssueListSchema = z.array(IssueSnapshotSchema);

const PRBodyEntry = z.object({
  number: z.number().int().positive(),
  body: z.string().nullable(),
});
export const PRListSchema = z.array(PRBodyEntry);

// PRs declare which issues they close via `Closes #N` / `Fixes #N` /
// `Resolves #N` (case-insensitive, optional past tense).
const CLOSES_PATTERN = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

export type OpenPRClosing = { pr: number; closes: number[] };

export function extractClosingNumbers(body: string | null): number[] {
  if (body === null) return [];
  const numbers = new Set<number>();
  for (const match of body.matchAll(CLOSES_PATTERN)) {
    const n = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(n) && n > 0) numbers.add(n);
  }
  return [...numbers];
}

// Convert validated PR-body shape into the (pr, closes[]) form the
// orchestrator consumes. Keeps the body parsing co-located with the schema.
export function prListToClosing(prs: z.infer<typeof PRListSchema>): OpenPRClosing[] {
  return prs.map((pr) => ({ pr: pr.number, closes: extractClosingNumbers(pr.body) }));
}
