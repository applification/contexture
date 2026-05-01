# ADR 0011: Chat→IR channel uses Claude Agent SDK + MCP `op_tools`, not structured output

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The product premise: a user chats with Claude about their domain, Claude edits the schema, the graph animates per edit. This requires Claude to produce IR mutations that:

- Are validated before they touch the live store.
- Animate one at a time, so the user sees what changed.
- Use the same vocabulary the UI uses, so undo and audit are uniform (see ADR 0007).
- Allow Claude to see the result of each edit and react on the next turn (a failed op should surface a real error message Claude can recover from).

A "produce the new IR as JSON" approach gives an opaque blob with no per-edit granularity, no per-edit validation, and no incremental animation.

## Decision

Use the Claude Agent SDK with an MCP server (`createSdkMcpServer` in `apps/desktop/src/main/ipc/claude.ts`) that registers one tool per supported `Op` kind. Claude calls `add_type`, `add_field`, `rename_type`, etc., as MCP tool calls. Each call dispatches through the same `apply(schema, op)` reducer the UI uses (ADR 0008). The reducer's `{schema} | {error}` result is returned as the tool result.

## Consequences

- Per-edit granularity for free: each tool call is one op, animated independently.
- Validation, undo, and audit are unified between human and Claude inputs.
- When an op fails, Claude sees the exact error string and can correct on the next tool call within the same turn.
- The system prompt advertises the curated stdlib (`SYSTEM_PROMPT_STDLIB`) so Claude can reference shared types instead of redefining them.
- Cost: tied to the Agent SDK's session lifecycle and tool-call protocol. Accepted — the alternative is reimplementing it.

## Alternatives considered

- **Structured output of the full IR:** loses incremental animation, mixes "describe a change" with "produce a value", weak per-edit error recovery.
- **Free-form text + a parser:** brittle and unintelligible to the user.
- **Function calling against the raw store:** would expose internal state shape to the model; ops are the right abstraction.
