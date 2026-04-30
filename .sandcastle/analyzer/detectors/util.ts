import type { Event, ToolEvent } from "./types";

// Best-effort wall-clock seconds between two ISO timestamps. Returns 0 on
// parse failure so detector cost-estimates degrade gracefully.
export function secondsBetween(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
  return Math.max(0, (tb - ta) / 1000);
}

// Average gap between consecutive tool calls within an agent run. Used to
// price wasted-tool-calls in seconds for detectors that can't directly
// observe a duration (e.g. "this Read was redundant").
export function averageInterToolSeconds(events: readonly Event[]): number {
  const tools = events.filter((e): e is ToolEvent => e.type === "tool");
  if (tools.length < 2) return 0;
  let total = 0;
  let n = 0;
  for (let i = 1; i < tools.length; i++) {
    const prev = tools[i - 1];
    const curr = tools[i];
    if (prev && curr) {
      total += secondsBetween(prev.t, curr.t);
      n++;
    }
  }
  return n === 0 ? 0 : total / n;
}

// Filter to ToolEvents only, preserving order.
export function toolsOnly(events: readonly Event[]): ToolEvent[] {
  return events.filter((e): e is ToolEvent => e.type === "tool");
}
