import type { Detector, Event, Finding } from "./types";
import { averageInterToolSeconds, toolsOnly } from "./util";

// A1: Identical (tool, args) pair invoked more than once within the same
// agent run. Strong signal of context-loss or missing in-harness caching.
// Counts only repeats — the first occurrence is real work.
export const redundantToolCall: Detector = {
  id: "A1-redundant-tool-call",
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
      const seen = new Map<string, number>();
      for (const t of tools) {
        const key = `${t.tool}\x00${t.args}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const avg = averageInterToolSeconds(evs);
      for (const [key, count] of seen) {
        if (count <= 1) continue;
        const repeats = count - 1;
        const [tool, args] = key.split("\x00");
        findings.push({
          detector: redundantToolCall.id,
          agentName,
          message: `${tool} called ${count}× with identical args`,
          evidence: `args: ${truncate(args ?? "", 120)}`,
          wastedToolCalls: repeats,
          wastedSeconds: repeats * avg,
          suggestedFix: "Add caching at the harness layer or pass the prior result forward in the prompt.",
          source: "deterministic",
        });
      }
    }
    return findings;
  },
};

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
