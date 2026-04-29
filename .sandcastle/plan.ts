import { z } from "zod";

// Branch names emitted by the planner agent must match this format. The agent
// is instructed in plan-prompt.md to produce `sandcastle/issue-{number}-{slug}`
// where slug is lowercase alphanumeric with `.`, `_`, `-` separators.
const BRANCH_REGEX = /^sandcastle\/issue-\d+-[a-z0-9._-]+$/;

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
