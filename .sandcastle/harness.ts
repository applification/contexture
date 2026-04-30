import { appendFileSync } from "node:fs";
import * as sandcastle from "@ai-hero/sandcastle";
import type {
  AgentStreamEvent,
  ClaudeCodeOptions,
  CodexOptions,
  IterationResult,
  IterationUsage,
  LoggingOption,
} from "@ai-hero/sandcastle";

// Provider-tagged spec. Each agent declares which sandcastle agent provider
// it uses (claudeCode | codex | opencode | pi); `agent()` below dispatches on
// the `provider` discriminator. Adding a new backend (e.g. Gemini, Ollama)
// means adding a variant here and a case in `agent()`, with no other
// downstream changes.
//
// Per-provider `effort` types are sourced from sandcastle's own option types
// so they stay aligned with what the underlying provider accepts.

export type ClaudeCodeSpec = {
  provider: "claudeCode";
  model: string;
  promptPath: string;
} & Pick<ClaudeCodeOptions, "effort">;

export type CodexSpec = {
  provider: "codex";
  model: string;
  promptPath: string;
} & Pick<CodexOptions, "effort">;

export type OpenCodeSpec = {
  provider: "opencode";
  model: string;
  promptPath: string;
};

export type PiSpec = {
  provider: "pi";
  model: string;
  promptPath: string;
};

export type AgentSpec = ClaudeCodeSpec | CodexSpec | OpenCodeSpec | PiSpec;

export const STREAM_LOG_PATH = ".sandcastle/logs/stream.log";

// Stable id for this orchestrator process. Stamped onto every stream-log
// line so the analyzer can group events by run without guessing boundaries
// from `iter` resets.
export const RUN_ID = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;

function appendStreamLine(obj: object): void {
  appendFileSync(STREAM_LOG_PATH, JSON.stringify(obj) + "\n");
}

// Append a one-off marker so the analyzer can split a multi-run stream.log
// into discrete runs. Call once at orchestrator start.
export function emitRunStart(): void {
  appendStreamLine({
    type: "run_start",
    runId: RUN_ID,
    t: new Date().toISOString(),
  });
}

// Append the usage tally returned by sandcastle for one internal
// iteration of an agent run. `iter` here is the orchestrator's outer
// iteration; `subIter` is sandcastle's per-run iteration index.
export function emitUsage(
  name: string,
  iter: number,
  subIter: number,
  usage: IterationUsage,
): void {
  appendStreamLine({
    type: "usage",
    runId: RUN_ID,
    name,
    iter,
    subIter,
    t: new Date().toISOString(),
    inputTokens: usage.inputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    outputTokens: usage.outputTokens,
  });
}

// Emit a usage record for each iteration that carries usage data. Iterations
// without `usage` (provider opted out, capture disabled) are silently skipped.
export function emitUsageFromRun(
  name: string,
  iter: number,
  iterations: readonly IterationResult[],
): void {
  iterations.forEach((it, idx) => {
    if (it.usage) emitUsage(name, iter, idx + 1, it.usage);
  });
}

// Build a sandcastle AgentProvider from an AgentSpec. Each provider's options
// object accepts an optional `effort` (or has no effort at all), so we can
// always pass options through — no need to branch on whether effort is set.
export function agent(spec: AgentSpec) {
  switch (spec.provider) {
    case "claudeCode":
      return sandcastle.claudeCode(spec.model, { effort: spec.effort });
    case "codex":
      return sandcastle.codex(spec.model, { effort: spec.effort });
    case "opencode":
      return sandcastle.opencode(spec.model);
    case "pi":
      return sandcastle.pi(spec.model);
  }
}

export function streamLogger(name: string): LoggingOption {
  return {
    type: "file",
    path: `.sandcastle/logs/${name}.log`,
    onAgentStreamEvent: (event: AgentStreamEvent) => {
      const base = { runId: RUN_ID, name, iter: event.iteration, t: event.timestamp };
      appendStreamLine(
        event.type === "text"
          ? { ...base, type: "text", text: event.message }
          : { ...base, type: "tool", tool: event.name, args: event.formattedArgs },
      );
    },
  };
}
