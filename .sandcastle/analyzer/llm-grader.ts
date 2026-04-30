import Anthropic from "@anthropic-ai/sdk";
import type { Event, Finding, ToolEvent } from "./detectors/types";
import { groupByAgentRun, groupByIssue } from "./parse";

// Whole-issue LLM grading. For each issue's bundle of agent runs, ask Haiku
// to identify harness/prompt mistakes the deterministic detectors couldn't
// pattern-match. The grader emits structured JSON which we coerce into
// `Finding[]` and merge into the same report.

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You analyse the tool-use traces of LLM agents working on coding tasks.
Your job is to spot harness or prompt mistakes — moments where the agent wasted effort because of how the harness was set up, not because the task was hard.

You are looking for things deterministic pattern-matching cannot easily catch:
- Agent confusion that suggests prompt ambiguity
- Missed affordances (the agent didn't know about a tool or convention)
- Cross-agent inefficiencies (e.g. reviewer redoing work the implementer already did)
- Repeated reasoning loops where the prompt failed to anchor the next step

For each issue you analyse, return a JSON object:
{
  "findings": [
    {
      "agentName": "<the agent name from the trace>",
      "message": "<concise description of the mistake>",
      "evidence": "<one short quote or summary that supports it>",
      "wastedToolCalls": <integer estimate>,
      "wastedSeconds": <integer estimate>,
      "suggestedFix": "<one sentence on how to fix the harness or prompt>"
    }
  ]
}

If the trace looks healthy, return {"findings": []}. Be conservative — false positives waste the user's time.`;

export async function llmGrade(events: readonly Event[]): Promise<Finding[]> {
  const client = new Anthropic();
  const byAgent = groupByAgentRun(events);
  const byIssue = groupByIssue(byAgent);
  const out: Finding[] = [];

  for (const [issueKey, perAgent] of byIssue) {
    if (issueKey === "unknown") continue;
    const summary = summariseIssue(perAgent);
    if (summary.length === 0) continue;

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Issue #${issueKey}\n\n${summary}\n\nReturn the JSON object only, no prose.`,
        },
      ],
    });

    const text = extractText(message);
    const parsed = safeParse(text);
    for (const f of parsed) {
      out.push({
        detector: "LLM-grader",
        agentName: f.agentName,
        issueNumber: typeof issueKey === "number" ? issueKey : undefined,
        message: f.message,
        evidence: f.evidence,
        wastedToolCalls: f.wastedToolCalls,
        wastedSeconds: f.wastedSeconds,
        suggestedFix: f.suggestedFix,
        source: "llm",
      });
    }
  }

  return out;
}

// Compact, LLM-friendly summary of one issue's traces. Limit each agent to
// its first ~120 tool-call lines to keep token spend bounded — the late
// tail rarely changes the verdict.
function summariseIssue(perAgent: Map<string, Event[]>): string {
  const blocks: string[] = [];
  for (const [name, evs] of perAgent) {
    const lines: string[] = [`AGENT ${name}`];
    let toolCount = 0;
    for (const ev of evs) {
      if (ev.type === "tool" && toolCount < 120) {
        lines.push(`  tool ${ev.tool}: ${truncate((ev as ToolEvent).args, 120)}`);
        toolCount++;
      } else if (ev.type === "text") {
        const t = ev.text.trim();
        if (t.length > 0) lines.push(`  text: ${truncate(t, 200)}`);
      }
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

function extractText(message: Anthropic.Messages.Message): string {
  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

type LlmFinding = {
  agentName: string;
  message: string;
  evidence: string;
  wastedToolCalls: number;
  wastedSeconds: number;
  suggestedFix: string;
};

function safeParse(raw: string): LlmFinding[] {
  // The model occasionally wraps JSON in fences or adds prose; extract the
  // outermost {...} block before parsing.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { findings?: LlmFinding[] };
    if (!parsed || !Array.isArray(parsed.findings)) return [];
    return parsed.findings.filter(isLlmFinding);
  } catch {
    return [];
  }
}

function isLlmFinding(v: unknown): v is LlmFinding {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.agentName === "string" &&
    typeof o.message === "string" &&
    typeof o.evidence === "string" &&
    typeof o.wastedToolCalls === "number" &&
    typeof o.wastedSeconds === "number" &&
    typeof o.suggestedFix === "string"
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
