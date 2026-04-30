import type { Detector, Event, Finding, ToolEvent } from "./types";
import { averageInterToolSeconds, secondsBetween, toolsOnly } from "./util";

const RETRY_WINDOW_SECONDS = 8;

// A3: A tool call closely followed by another invocation of the same tool
// with substantially-overlapping but non-identical args is a strong signal
// of a retry — typically the agent fixing a wrong path, typo'd flag, or
// failed match. We don't see the tool result in the stream, so this is
// heuristic; the window keeps it from misfiring on legitimate sequential
// reads.
export const failedToolRetry: Detector = {
  id: "A3-failed-tool-retry",
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
      const avg = averageInterToolSeconds(evs);
      let retries = 0;
      const examples: string[] = [];
      for (let i = 1; i < tools.length; i++) {
        const prev = tools[i - 1];
        const curr = tools[i];
        if (!prev || !curr) continue;
        if (prev.tool !== curr.tool) continue;
        if (prev.args === curr.args) continue;
        const gap = secondsBetween(prev.t, curr.t);
        if (gap > RETRY_WINDOW_SECONDS) continue;
        if (!isLikelyRetryPair(prev, curr)) continue;
        retries++;
        if (examples.length < 3) examples.push(`${prev.tool}: ${shortDiff(prev.args, curr.args)}`);
      }
      if (retries === 0) continue;
      findings.push({
        detector: failedToolRetry.id,
        agentName,
        message: `${retries} likely tool retry${retries === 1 ? "" : "s"} (same tool, similar args, <${RETRY_WINDOW_SECONDS}s apart)`,
        evidence: examples.join(" | "),
        wastedToolCalls: retries,
        wastedSeconds: retries * avg,
        suggestedFix: "Improve tool affordance — surface valid paths/options in the prompt or tool description.",
        source: "deterministic",
      });
    }
    return findings;
  },
};

// Two args look like a retry when their normalized edit distance is small:
// most characters match, only a handful differ. This catches typo'd paths,
// flag-name fixes, and small refinements while rejecting unrelated calls
// that happen to share an extension or a leading slash.
const RETRY_DISTANCE_THRESHOLD = 0.3;

function isLikelyRetryPair(prev: ToolEvent, curr: ToolEvent): boolean {
  const a = prev.args;
  const b = curr.args;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return false;
  return editDistance(a, b) / maxLen <= RETRY_DISTANCE_THRESHOLD;
}

// Standard Levenshtein. Args are short (paths, flags, snippets) so the O(nm)
// table is fine — capping max args length at ~512 keeps it safe.
function editDistance(a: string, b: string): number {
  const A = a.length > 512 ? a.slice(0, 512) : a;
  const B = b.length > 512 ? b.slice(0, 512) : b;
  const m = A.length;
  const n = B.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

function shortDiff(a: string, b: string): string {
  return `'${truncate(a, 40)}' → '${truncate(b, 40)}'`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
