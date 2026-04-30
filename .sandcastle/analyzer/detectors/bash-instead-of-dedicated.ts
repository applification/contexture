import type { Detector, Event, Finding, ToolEvent } from "./types";
import { averageInterToolSeconds, toolsOnly } from "./util";

// Maps a Bash command pattern to the dedicated tool that should have been
// used. Patterns are anchored to common command starts; we deliberately
// don't try to parse pipelines because the cost of false positives outweighs
// the value of catching every variation.
const BASH_REPLACEMENTS: Array<{ pattern: RegExp; tool: string }> = [
  { pattern: /^\s*cat\b/, tool: "Read" },
  { pattern: /^\s*head\b/, tool: "Read" },
  { pattern: /^\s*tail\b/, tool: "Read" },
  { pattern: /^\s*(rg|grep)\b/, tool: "Grep" },
  { pattern: /^\s*find\b/, tool: "Glob" },
  { pattern: /^\s*ls\b/, tool: "Glob" },
  { pattern: /^\s*sed\b/, tool: "Edit" },
  { pattern: /^\s*awk\b/, tool: "Edit" },
];

// A4: Bash invocations whose first command has a dedicated equivalent
// (Read/Grep/Glob/Edit). These usually indicate the agent didn't internalise
// the dedicated tool's affordance — fix is in the prompt, not the agent.
export const bashInsteadOfDedicated: Detector = {
  id: "A4-bash-instead-of-dedicated",
  run(events) {
    const findings: Finding[] = [];
    const byAgent = new Map<string, Event[]>();
    for (const ev of events) {
      if (ev.type === "run_start") continue;
      const list = byAgent.get(ev.name) ?? [];
      list.push(ev);
      byAgent.set(ev.name, list);
    }

    for (const [agentName, evs] of byAgent) {
      const tools = toolsOnly(evs);
      const hits: Array<{ tool: ToolEvent; replacement: string }> = [];
      for (const t of tools) {
        if (t.tool !== "Bash") continue;
        for (const { pattern, tool: replacement } of BASH_REPLACEMENTS) {
          if (pattern.test(t.args)) {
            hits.push({ tool: t, replacement });
            break;
          }
        }
      }
      if (hits.length === 0) continue;
      const avg = averageInterToolSeconds(evs);
      const examples = hits
        .slice(0, 3)
        .map((h) => `${h.replacement} via Bash: ${truncate(h.tool.args, 60)}`)
        .join(" | ");
      findings.push({
        detector: bashInsteadOfDedicated.id,
        agentName,
        message: `${hits.length} Bash call${hits.length === 1 ? "" : "s"} that could have used a dedicated tool`,
        evidence: examples,
        wastedToolCalls: hits.length,
        wastedSeconds: hits.length * avg,
        suggestedFix: "Reinforce in the prompt: prefer Read/Grep/Glob/Edit over Bash for these operations.",
        source: "deterministic",
      });
    }
    return findings;
  },
};

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
