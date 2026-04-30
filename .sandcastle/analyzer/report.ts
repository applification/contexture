import type { Event, Finding, UsageEvent } from "./detectors/types";
import { inferIssueFromLogName } from "./parse";

export type ReportInput = {
  runId: string;
  events: readonly Event[];
  findings: readonly Finding[];
  generatedAt: string;
};

// Render a markdown report grouping findings per-issue and ranking each
// section by cost (wasted tool calls, then wasted seconds). Emits a header
// summary so the user can decide whether to read further.
export function renderReport(input: ReportInput): string {
  const { runId, events, findings, generatedAt } = input;
  const usageByName = collectUsage(events);
  const lines: string[] = [];

  lines.push(`# Sandcastle harness analysis`);
  lines.push("");
  lines.push(`- Run: \`${runId}\``);
  lines.push(`- Generated: ${generatedAt}`);
  lines.push("");

  // Header summary
  const totalWastedTools = findings.reduce((s, f) => s + f.wastedToolCalls, 0);
  const totalWastedSecs = findings.reduce((s, f) => s + f.wastedSeconds, 0);
  const detTotal = findings.filter((f) => f.source !== "llm").length;
  const llmTotal = findings.filter((f) => f.source === "llm").length;
  const sortedAll = [...findings].sort(byCost);
  const top = sortedAll[0];

  lines.push(`## Summary`);
  lines.push("");
  lines.push(
    `- ${findings.length} finding${findings.length === 1 ? "" : "s"} (${detTotal} deterministic, ${llmTotal} LLM)`,
  );
  lines.push(`- Estimated waste: ${totalWastedTools} tool call${totalWastedTools === 1 ? "" : "s"}, ~${Math.round(totalWastedSecs)}s`);
  if (top) {
    lines.push(`- Biggest win: **${top.message}** in \`${top.agentName}\` (${top.wastedToolCalls} calls, ~${Math.round(top.wastedSeconds)}s)`);
  }
  if (usageByName.size > 0) {
    const totals = sumUsage([...usageByName.values()].flat());
    const grand =
      totals.inputTokens +
      totals.cacheCreationInputTokens +
      totals.cacheReadInputTokens +
      totals.outputTokens;
    lines.push(
      `- Tokens this run: input ${fmt(totals.inputTokens)}, cache-create ${fmt(totals.cacheCreationInputTokens)}, cache-read ${fmt(totals.cacheReadInputTokens)}, output ${fmt(totals.outputTokens)} (total ${fmt(grand)})`,
    );
  }
  lines.push("");

  // Per-issue grouping
  const byIssue = groupFindingsByIssue(findings);
  const issueKeys = [...byIssue.keys()].sort((a, b) => issueSortKey(a) - issueSortKey(b));

  for (const issue of issueKeys) {
    const issueFindings = byIssue.get(issue) ?? [];
    if (issueFindings.length === 0) continue;
    lines.push(`## Issue ${issue === "unknown" ? "(unknown)" : `#${issue}`}`);
    lines.push("");

    // Sub-group by phase, ordered implementer → reviewer → pr-opener → other.
    const byPhase = groupFindingsByPhase(issueFindings);
    for (const phase of ["implementer", "reviewer", "pr-opener", "other"] as const) {
      const phaseFindings = (byPhase.get(phase) ?? []).slice().sort(byCost);
      if (phaseFindings.length === 0) continue;
      lines.push(`### ${capitalise(phase)}`);
      lines.push("");
      const phaseUsage = phaseUsageFor(usageByName, phase, issue);
      if (phaseUsage) {
        lines.push(`_Usage: ${phaseUsage}_`);
        lines.push("");
      }
      for (const f of phaseFindings) {
        lines.push(`- **${f.message}** (${f.detector}${f.source === "llm" ? ", llm" : ""})`);
        lines.push(`  - Cost: ${f.wastedToolCalls} call${f.wastedToolCalls === 1 ? "" : "s"}, ~${Math.round(f.wastedSeconds)}s`);
        if (f.evidence) lines.push(`  - Evidence: ${f.evidence}`);
        lines.push(`  - Suggested fix: ${f.suggestedFix}`);
      }
      lines.push("");
    }
  }

  if (findings.length === 0) {
    lines.push(`_No findings — clean run._`);
    lines.push("");
  }

  return lines.join("\n");
}

function byCost(a: Finding, b: Finding): number {
  if (b.wastedToolCalls !== a.wastedToolCalls) return b.wastedToolCalls - a.wastedToolCalls;
  return b.wastedSeconds - a.wastedSeconds;
}

function groupFindingsByIssue(findings: readonly Finding[]): Map<number | "unknown", Finding[]> {
  const out = new Map<number | "unknown", Finding[]>();
  for (const f of findings) {
    const key: number | "unknown" =
      f.issueNumber ?? inferIssueFromLogName(f.agentName) ?? "unknown";
    const list = out.get(key) ?? [];
    list.push(f);
    out.set(key, list);
  }
  return out;
}

function groupFindingsByPhase(findings: readonly Finding[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  for (const f of findings) {
    const phase = phaseOfName(f.agentName);
    const list = out.get(phase) ?? [];
    list.push(f);
    out.set(phase, list);
  }
  return out;
}

function phaseOfName(agentName: string): "implementer" | "reviewer" | "pr-opener" | "other" {
  if (agentName.includes("implementer")) return "implementer";
  if (agentName.includes("reviewer")) return "reviewer";
  if (agentName.includes("pr-")) return "pr-opener";
  return "other";
}

function collectUsage(events: readonly Event[]): Map<string, UsageEvent[]> {
  const out = new Map<string, UsageEvent[]>();
  for (const ev of events) {
    if (ev.type !== "usage") continue;
    const list = out.get(ev.name) ?? [];
    list.push(ev);
    out.set(ev.name, list);
  }
  return out;
}

function phaseUsageFor(
  usageByName: Map<string, UsageEvent[]>,
  phase: string,
  issue: number | "unknown",
): string | undefined {
  if (issue === "unknown") return undefined;
  const matching: UsageEvent[] = [];
  for (const [name, evs] of usageByName) {
    if (phaseOfName(name) !== phase) continue;
    if (inferIssueFromLogName(name) !== issue) continue;
    matching.push(...evs);
  }
  if (matching.length === 0) return undefined;
  const tot = sumUsage(matching);
  const grand =
    tot.inputTokens + tot.cacheCreationInputTokens + tot.cacheReadInputTokens + tot.outputTokens;
  return `total ${fmt(grand)} tokens (in ${fmt(tot.inputTokens)}, cache-c ${fmt(tot.cacheCreationInputTokens)}, cache-r ${fmt(tot.cacheReadInputTokens)}, out ${fmt(tot.outputTokens)})`;
}

function sumUsage(evs: UsageEvent[]): {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
} {
  return evs.reduce(
    (acc, e) => ({
      inputTokens: acc.inputTokens + e.inputTokens,
      cacheCreationInputTokens: acc.cacheCreationInputTokens + e.cacheCreationInputTokens,
      cacheReadInputTokens: acc.cacheReadInputTokens + e.cacheReadInputTokens,
      outputTokens: acc.outputTokens + e.outputTokens,
    }),
    { inputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0 },
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function issueSortKey(k: number | "unknown"): number {
  return k === "unknown" ? Number.POSITIVE_INFINITY : k;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
