import type { Detector, Event, Finding, ToolEvent } from "./types";
import { averageInterToolSeconds, toolsOnly } from "./util";

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "LS"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const EXPLORATION_THRESHOLD = 12;

// B6: An implementer that spends many read/search calls before its first
// write usually wasn't anchored well by the prompt. The threshold is
// deliberately high — quick exploration is fine; the signal is *excess*.
export const excessiveExploration: Detector = {
  id: "B6-excessive-exploration",
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
      // Only meaningful for agents whose job is to make edits.
      if (!agentName.includes("implementer") && !agentName.includes("reviewer")) continue;
      const tools = toolsOnly(evs);
      const firstWriteIdx = tools.findIndex((t) => WRITE_TOOLS.has(t.tool));
      const explorationSlice: ToolEvent[] = firstWriteIdx === -1 ? tools : tools.slice(0, firstWriteIdx);
      const reads = explorationSlice.filter((t) => READ_TOOLS.has(t.tool));
      if (reads.length <= EXPLORATION_THRESHOLD) continue;
      const excess = reads.length - EXPLORATION_THRESHOLD;
      const avg = averageInterToolSeconds(evs);
      findings.push({
        detector: excessiveExploration.id,
        agentName,
        message: `${reads.length} read/search calls before first edit (threshold ${EXPLORATION_THRESHOLD})`,
        evidence: `Tools used: ${countByTool(reads)}`,
        wastedToolCalls: excess,
        wastedSeconds: excess * avg,
        suggestedFix: "Anchor the prompt with the specific files/symbols to start from, or pre-compute a file map.",
        source: "deterministic",
      });
    }
    return findings;
  },
};

function countByTool(tools: ToolEvent[]): string {
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(t.tool, (counts.get(t.tool) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => `${k}×${v}`).join(", ");
}
