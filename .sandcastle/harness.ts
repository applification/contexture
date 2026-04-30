import { appendFileSync } from "node:fs";
import * as sandcastle from "@ai-hero/sandcastle";
import type {
  AgentStreamEvent,
  ClaudeCodeOptions,
  CodexOptions,
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
      const line =
        event.type === "text"
          ? JSON.stringify({
              name,
              iter: event.iteration,
              t: event.timestamp,
              type: "text",
              text: event.message,
            })
          : JSON.stringify({
              name,
              iter: event.iteration,
              t: event.timestamp,
              type: "tool",
              tool: event.name,
              args: event.formattedArgs,
            });
      appendFileSync(STREAM_LOG_PATH, line + "\n");
    },
  };
}
