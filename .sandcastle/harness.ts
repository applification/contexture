import { appendFileSync } from "node:fs";
import * as sandcastle from "@ai-hero/sandcastle";
import type { AgentStreamEvent, LoggingOption } from "@ai-hero/sandcastle";
import type { AgentSpec } from "./workflow";

export const STREAM_LOG_PATH = ".sandcastle/logs/stream.log";

// Build a sandcastle AgentProvider from an AgentSpec. Dispatches on the
// `provider` discriminator so adding a new backend means adding a case here
// (and a variant in workflow.ts), not touching every call site.
export function agent(spec: AgentSpec) {
  switch (spec.provider) {
    case "claudeCode":
      return spec.effort === undefined
        ? sandcastle.claudeCode(spec.model)
        : sandcastle.claudeCode(spec.model, { effort: spec.effort });
    case "codex":
      return spec.effort === undefined
        ? sandcastle.codex(spec.model)
        : sandcastle.codex(spec.model, { effort: spec.effort });
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
