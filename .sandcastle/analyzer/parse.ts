import { readFileSync } from "node:fs";
import type { Event } from "./detectors/types";

// Parse a stream.log file into a flat Event[]. Malformed lines are skipped
// silently — the analyzer is best-effort over a possibly truncated tail.
export function parseStreamLog(path: string): Event[] {
  const raw = readFileSync(path, "utf8");
  return parseStreamLogText(raw);
}

export function parseStreamLogText(raw: string): Event[] {
  const events: Event[] = [];
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    try {
      const parsed = JSON.parse(line) as Event;
      if (isEvent(parsed)) events.push(parsed);
    } catch {
      // skip malformed line
    }
  }
  return events;
}

function isEvent(v: unknown): v is Event {
  if (typeof v !== "object" || v === null) return false;
  const t = (v as { type?: unknown }).type;
  return t === "run_start" || t === "text" || t === "tool" || t === "usage";
}

// Group events by `runId`. Events without a `runId` (legacy logs predating
// the run_start marker) are bucketed under "legacy".
export type Run = {
  runId: string;
  startedAt: string | undefined;
  events: Event[];
};

export function groupByRun(events: readonly Event[]): Run[] {
  const byId = new Map<string, Run>();
  for (const ev of events) {
    const id = "runId" in ev && typeof ev.runId === "string" ? ev.runId : "legacy";
    let run = byId.get(id);
    if (!run) {
      run = { runId: id, startedAt: undefined, events: [] };
      byId.set(id, run);
    }
    if (ev.type === "run_start" && run.startedAt === undefined) run.startedAt = ev.t;
    run.events.push(ev);
  }
  return [...byId.values()];
}

// Group events within a run by `name` (one bucket per agent run, e.g.
// "iter1-implementer-42"). Run-level events (run_start) are excluded.
export function groupByAgentRun(events: readonly Event[]): Map<string, Event[]> {
  const byName = new Map<string, Event[]>();
  for (const ev of events) {
    if (ev.type === "run_start") continue;
    const list = byName.get(ev.name) ?? [];
    list.push(ev);
    byName.set(ev.name, list);
  }
  return byName;
}

// Group an agent run's events by issue number, derived from the agent's
// display name embedded in tool/text events. Used for per-issue reporting.
export function groupByIssue(byAgent: Map<string, Event[]>): Map<number | "unknown", Map<string, Event[]>> {
  const byIssue = new Map<number | "unknown", Map<string, Event[]>>();
  for (const [agentName, evs] of byAgent) {
    const issueKey = inferIssueFromLogName(agentName) ?? "unknown";
    const existing = byIssue.get(issueKey) ?? new Map<string, Event[]>();
    existing.set(agentName, evs);
    byIssue.set(issueKey, existing);
  }
  return byIssue;
}

// Extract issue number from a log-channel name like "iter3-implementer-42"
// or "iter1-pr-99". The orchestrator names channels with the issue suffix.
export function inferIssueFromLogName(name: string): number | undefined {
  const match = name.match(/-(\d+)$/);
  return match ? Number(match[1]) : undefined;
}
