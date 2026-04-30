import type { Detector, Event, Finding, ToolEvent } from "./types";
import { inferIssueFromLogName } from "../parse";
import { averageInterToolSeconds, toolsOnly } from "./util";

// C8: Reviewer reads a file the implementer wrote in the same issue's run.
// The harness could pass the implementer's diff or full file contents
// directly to the reviewer, saving a round-trip per file.
export const reviewerReReads: Detector = {
  id: "C8-reviewer-rereads",
  run(events) {
    const findings: Finding[] = [];
    const byAgent = new Map<string, Event[]>();
    for (const ev of events) {
      if (ev.type === "run_start") continue;
      const list = byAgent.get(ev.name) ?? [];
      list.push(ev);
      byAgent.set(ev.name, list);
    }

    // Build per-issue index: implementer-written paths.
    const writtenByIssue = new Map<number, Set<string>>();
    for (const [agentName, evs] of byAgent) {
      if (!agentName.includes("implementer")) continue;
      const issue = inferIssueFromLogName(agentName);
      if (issue === undefined) continue;
      const paths = writtenByIssue.get(issue) ?? new Set<string>();
      for (const t of toolsOnly(evs)) {
        if (t.tool === "Write" || t.tool === "Edit" || t.tool === "MultiEdit") {
          const p = extractPath(t.args);
          if (p) paths.add(p);
        }
      }
      writtenByIssue.set(issue, paths);
    }

    // For each reviewer run, count Reads whose path is in the matching set.
    for (const [agentName, evs] of byAgent) {
      if (!agentName.includes("reviewer")) continue;
      const issue = inferIssueFromLogName(agentName);
      if (issue === undefined) continue;
      const written = writtenByIssue.get(issue);
      if (!written || written.size === 0) continue;

      const rereads: ToolEvent[] = [];
      for (const t of toolsOnly(evs)) {
        if (t.tool !== "Read") continue;
        const p = extractPath(t.args);
        if (p && written.has(p)) rereads.push(t);
      }
      if (rereads.length === 0) continue;

      const avg = averageInterToolSeconds(evs);
      const examples = rereads
        .slice(0, 3)
        .map((t) => extractPath(t.args) ?? "")
        .filter(Boolean)
        .join(", ");
      findings.push({
        detector: reviewerReReads.id,
        agentName,
        issueNumber: issue,
        message: `Reviewer re-read ${rereads.length} file${rereads.length === 1 ? "" : "s"} the implementer just wrote`,
        evidence: `paths: ${examples}`,
        wastedToolCalls: rereads.length,
        wastedSeconds: rereads.length * avg,
        suggestedFix: "Pass the implementer's diff (or full new file contents) into the reviewer prompt instead.",
        source: "deterministic",
      });
    }
    return findings;
  },
};

// Best-effort path extraction from a `formattedArgs` string. Sandcastle
// formats tool args as a human-readable line; the path is typically the
// first token starting with `/` or `./`, or the first quoted path. Returns
// undefined when no clear path is present.
function extractPath(args: string): string | undefined {
  // 1) absolute path
  const abs = args.match(/(?:^|\s|["'])(\/[^\s"']+)/);
  if (abs?.[1]) return abs[1];
  // 2) relative path (./ or workspace-relative starting with letter+/)
  const rel = args.match(/(?:^|\s|["'])((?:\.\/)?(?:[\w@-]+\/)+[\w@.-]+)/);
  if (rel?.[1]) return rel[1];
  return undefined;
}
