// Shared types for the sandcastle log analyzer. Every detector consumes
// `Event[]` and returns `Finding[]`; the report renderer ranks findings by
// estimated cost and groups them per-issue.

export type RunStartEvent = {
  type: "run_start";
  runId: string;
  t: string;
};

export type TextEvent = {
  type: "text";
  runId: string;
  name: string;
  iter: number;
  t: string;
  text: string;
};

export type ToolEvent = {
  type: "tool";
  runId: string;
  name: string;
  iter: number;
  t: string;
  tool: string;
  args: string;
};

export type UsageEvent = {
  type: "usage";
  runId: string;
  name: string;
  iter: number;
  subIter: number;
  t: string;
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
};

export type Event = RunStartEvent | TextEvent | ToolEvent | UsageEvent;

// One detected harness-improvement opportunity. `wastedToolCalls` is the
// detector's estimate of how many tool calls (or equivalents) were wasted;
// `wastedSeconds` is the wall-clock cost. The renderer ranks by these.
export type Finding = {
  detector: string;
  agentName: string;
  issueNumber?: number;
  iter?: number;
  message: string;
  evidence: string;
  wastedToolCalls: number;
  wastedSeconds: number;
  suggestedFix: string;
  source?: "deterministic" | "llm";
};

export type Detector = {
  id: string;
  run(events: readonly Event[]): Finding[];
};

// Extract issue number from a sandcastle agent name like "Implementer #42",
// "Reviewer #42", or "PR-Opener #42".
export function parseIssueNumber(agentName: string): number | undefined {
  const match = agentName.match(/#(\d+)\s*$/);
  return match ? Number(match[1]) : undefined;
}

// Coarse phase classification from agent name. Used to group per-issue and
// to drive cross-agent detectors (e.g. reviewer re-reads implementer files).
export type AgentPhase = "implementer" | "reviewer" | "pr-opener" | "other";

export function phaseOf(agentName: string): AgentPhase {
  const n = agentName.toLowerCase();
  if (n.includes("pr-opener") || n.includes("propener") || n.startsWith("pr ")) return "pr-opener";
  if (n.includes("reviewer")) return "reviewer";
  if (n.includes("implementer")) return "implementer";
  return "other";
}
