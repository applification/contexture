import type { Event, Finding, ToolEvent } from "./types";

// Persistent baseline kept across runs so we can flag the current run's
// agents when they spike vs historical averages. Stats are tracked per
// "phase" (implementer / reviewer / pr-opener) — the three roles have
// very different expected costs and shouldn't share a baseline.
export type BaselineStats = {
  count: number;
  meanToolCalls: number;
  m2ToolCalls: number; // sum of squared deviations, for online variance
  meanSeconds: number;
  m2Seconds: number;
};

export type Baseline = {
  byPhase: Record<string, BaselineStats>;
};

export const emptyBaseline = (): Baseline => ({ byPhase: {} });

const Z_THRESHOLD = 2;

// E12: Agent runs whose tool-call count or wall-clock is >2σ above the
// historical mean for that phase. Below 5 historical samples we don't have
// enough signal — silently skip.
export function runOutlier(events: readonly Event[], baseline: Baseline): Finding[] {
  const findings: Finding[] = [];
  const byAgent = new Map<string, Event[]>();
  for (const ev of events) {
    if (ev.type === "run_start") continue;
    const list = byAgent.get(ev.name) ?? [];
    list.push(ev);
    byAgent.set(ev.name, list);
  }

  for (const [agentName, evs] of byAgent) {
    const phase = phaseFromName(agentName);
    if (!phase) continue;
    const stats = baseline.byPhase[phase];
    if (!stats || stats.count < 5) continue;

    const tools = evs.filter((e): e is ToolEvent => e.type === "tool");
    const toolCount = tools.length;
    const seconds = durationOf(evs);

    const toolStd = stdDev(stats.m2ToolCalls, stats.count);
    const secStd = stdDev(stats.m2Seconds, stats.count);

    const toolZ = toolStd > 0 ? (toolCount - stats.meanToolCalls) / toolStd : 0;
    const secZ = secStd > 0 ? (seconds - stats.meanSeconds) / secStd : 0;

    if (toolZ < Z_THRESHOLD && secZ < Z_THRESHOLD) continue;

    const reasons: string[] = [];
    if (toolZ >= Z_THRESHOLD) {
      reasons.push(`${toolCount} tool calls vs baseline ${stats.meanToolCalls.toFixed(0)} (z=${toolZ.toFixed(1)})`);
    }
    if (secZ >= Z_THRESHOLD) {
      reasons.push(`${seconds.toFixed(0)}s vs baseline ${stats.meanSeconds.toFixed(0)}s (z=${secZ.toFixed(1)})`);
    }

    const wastedTools = Math.max(0, toolCount - stats.meanToolCalls);
    const wastedSecs = Math.max(0, seconds - stats.meanSeconds);
    findings.push({
      detector: "E12-run-outlier",
      agentName,
      message: `${phase} run is an outlier vs historical baseline`,
      evidence: reasons.join("; "),
      wastedToolCalls: Math.round(wastedTools),
      wastedSeconds: Math.round(wastedSecs),
      suggestedFix: "Compare this run's tool sequence against a typical one; the prompt or the issue may be off-pattern.",
      source: "deterministic",
    });
  }
  return findings;
}

// Update baseline with this run's per-agent measurements. Uses Welford's
// online algorithm so we don't need to keep history — count, mean, M2
// are sufficient.
export function updateBaseline(baseline: Baseline, events: readonly Event[]): Baseline {
  const byAgent = new Map<string, Event[]>();
  for (const ev of events) {
    if (ev.type === "run_start") continue;
    const list = byAgent.get(ev.name) ?? [];
    list.push(ev);
    byAgent.set(ev.name, list);
  }

  const next: Baseline = { byPhase: { ...baseline.byPhase } };
  for (const [agentName, evs] of byAgent) {
    const phase = phaseFromName(agentName);
    if (!phase) continue;
    const tools = evs.filter((e): e is ToolEvent => e.type === "tool");
    const toolCount = tools.length;
    const seconds = durationOf(evs);
    const prev = next.byPhase[phase] ?? {
      count: 0,
      meanToolCalls: 0,
      m2ToolCalls: 0,
      meanSeconds: 0,
      m2Seconds: 0,
    };
    next.byPhase[phase] = welford(prev, toolCount, seconds);
  }
  return next;
}

function welford(stats: BaselineStats, toolCount: number, seconds: number): BaselineStats {
  const count = stats.count + 1;
  const dTool = toolCount - stats.meanToolCalls;
  const meanToolCalls = stats.meanToolCalls + dTool / count;
  const m2ToolCalls = stats.m2ToolCalls + dTool * (toolCount - meanToolCalls);
  const dSec = seconds - stats.meanSeconds;
  const meanSeconds = stats.meanSeconds + dSec / count;
  const m2Seconds = stats.m2Seconds + dSec * (seconds - meanSeconds);
  return { count, meanToolCalls, m2ToolCalls, meanSeconds, m2Seconds };
}

function stdDev(m2: number, count: number): number {
  if (count < 2) return 0;
  return Math.sqrt(m2 / (count - 1));
}

function phaseFromName(agentName: string): string | undefined {
  if (agentName.includes("implementer")) return "implementer";
  if (agentName.includes("reviewer")) return "reviewer";
  if (agentName.includes("pr-")) return "pr-opener";
  return undefined;
}

function durationOf(events: Event[]): number {
  if (events.length < 2) return 0;
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last) return 0;
  const ta = Date.parse(first.t);
  const tb = Date.parse(last.t);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
  return Math.max(0, (tb - ta) / 1000);
}
