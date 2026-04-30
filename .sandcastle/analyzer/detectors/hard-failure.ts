import type { Detector, Event, Finding, TextEvent, ToolEvent } from "./types";
import { secondsBetween } from "./util";

const ERROR_KEYWORDS = /\b(error|failed|failure|timed out|aborted|exception|cannot|unable to)\b/i;

// D10: Hard failures — an agent run that visibly errored or never made
// progress. Two complementary signals:
//   (a) the trailing text events contain error keywords, suggesting the
//       agent crashed or gave up;
//   (b) zero tool calls across the run, suggesting the harness failed to
//       launch the agent at all.
export const hardFailure: Detector = {
  id: "D10-hard-failure",
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
      const tools = evs.filter((e): e is ToolEvent => e.type === "tool");
      const texts = evs.filter((e): e is TextEvent => e.type === "text");

      if (tools.length === 0 && texts.length > 0) {
        findings.push({
          detector: hardFailure.id,
          agentName,
          message: "Agent produced text but made no tool calls — likely failed to engage",
          evidence: truncate(texts[0]?.text ?? "", 160),
          wastedToolCalls: 1,
          wastedSeconds: durationOf(evs),
          suggestedFix: "Check the prompt and provider config; agent never reached the tool-use loop.",
          source: "deterministic",
        });
        continue;
      }

      // Look at the last few text events for error-tone language.
      const tail = texts.slice(-3);
      const errorTexts = tail.filter((t) => ERROR_KEYWORDS.test(t.text));
      if (errorTexts.length > 0) {
        findings.push({
          detector: hardFailure.id,
          agentName,
          message: "Agent run ended with error-tone text",
          evidence: truncate(errorTexts[errorTexts.length - 1]?.text ?? "", 160),
          wastedToolCalls: tools.length,
          wastedSeconds: durationOf(evs),
          suggestedFix: "Inspect the surrounding tool calls; consider adding retry or fallback in the harness.",
          source: "deterministic",
        });
      }
    }
    return findings;
  },
};

function durationOf(events: Event[]): number {
  if (events.length < 2) return 0;
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last) return 0;
  return secondsBetween(first.t, last.t);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
