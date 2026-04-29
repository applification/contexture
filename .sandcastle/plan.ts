import slugify from "@sindresorhus/slugify";
import { z } from "zod";

// Branch contract: `sandcastle/issue-{number}-{slug}` where slug is lowercase
// alphanumeric with `.`, `_`, `-` separators, and the whole branch is at most
// 200 chars. The regex and the minter live next to each other so the format
// has one source of truth.
const BRANCH_REGEX = /^sandcastle\/issue-\d+-[a-z0-9._-]+$/;

// Slug cap accounts for the fixed prefix `sandcastle/issue-{N}-` (~26 chars
// for issue numbers under 10^7), leaving comfortable headroom under the
// 200-char branch cap.
const MAX_SLUG_LENGTH = 160;

// Deterministic, idempotent issue → branch derivation. Uses
// @sindresorhus/slugify (handles Unicode + repeated separators) then
// truncates the slug.
export function makeBranch(issueNumber: number, title: string): string {
  const rawSlug = slugify(title, { separator: "-", lowercase: true });
  // Slugify can return an empty string for titles with no slug-able content
  // (e.g. only emoji). Fall back to a stable placeholder so the branch is
  // still valid against the regex (`[a-z0-9._-]+` requires at least one char).
  const slug = (rawSlug.length === 0 ? "untitled" : rawSlug).slice(0, MAX_SLUG_LENGTH);
  return `sandcastle/issue-${issueNumber}-${slug}`;
}

export const Issue = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  branch: z.string().regex(BRANCH_REGEX).max(200),
  labels: z.array(z.string()),
});
export type Issue = z.infer<typeof Issue>;

export const Plan = z.object({
  issues: z.array(Issue),
});
export type Plan = z.infer<typeof Plan>;

// Extract and validate the agent's <plan>{...}</plan> output. Throws if the
// tag is missing, the JSON is malformed, or the shape fails validation.
export function parsePlan(stdout: string): Plan {
  const match = stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!match) {
    throw new Error("Orchestrator did not produce a <plan> tag.\n\n" + stdout);
  }
  return Plan.parse(JSON.parse(match[1] as string));
}
