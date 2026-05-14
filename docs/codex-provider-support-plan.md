# Codex-First Provider Runtime Plan

- **Status:** Proposed
- **Date:** 2026-05-14

## Context

Contexture's existing schema chat implementation is Claude-shaped. It uses the Claude Agent SDK plus MCP op tools and assumes Claude Code CLI / Agent SDK behavior as the primary runtime.

That priority has changed. Claude Code CLI / Agent SDK usage now draws from API tokens rather than the user's subscription, which makes it a poor default for Contexture's product goal. Codex has become the primary integration target because `codex app-server` supports ChatGPT-managed auth and gives Contexture a path to subscription-backed local agent use.

There are no external users to preserve compatibility for. We can replace persisted chat/provider state, rename IPC and renderer hooks, and drop old Claude-only sessions without migration work. The old Claude implementation is useful as reference material, not as an incumbent architecture to protect.

## Goal

Rebuild Contexture's schema-agent chat around a provider-neutral runtime contract, with Codex as the primary and default implementation.

The user-facing contract remains:

- chat edits the in-memory schema only through Contexture's closed-world op vocabulary
- graph updates animate incrementally per op
- one assistant turn maps to one undoable transaction
- stop / interrupt / failure rolls back the whole in-flight turn
- provider credentials are owned by the provider runtime, not stored by Contexture

Claude Agent SDK support remains desirable, but it is no longer on the critical path. It should be added later only if it fits the Codex-proven provider contract without distorting it.

## Architectural Posture

Use the `t3code` approach as the conceptual base: provider-neutral shell, provider-specific adapters, canonical runtime events, provider capabilities, and opaque provider resume state.

But Contexture should keep a narrower product surface than `t3code`. We do not need T3Code's full coding-agent project/worktree/checkpoint machinery for schema chat. Contexture's v1 surface is a constrained schema agent, not a general repo mutation agent.

The right framing is:

- **provider-neutral contract now**
- **Codex runtime first**
- **Claude compatibility later**
- **no backward-compat persistence migration**

## Non-Negotiable Product Invariants

### Schema Ops Only

The schema chat surface must expose only Contexture schema ops to the model.

No general filesystem, shell, repo mutation, browser, or network tools should be available from schema chat v1. If broader coding-agent features are added later, they should live in a separate surface with separate safety semantics.

### Shared Op Registry

`createOpTools()` remains the single source of truth for agent-visible schema mutations.

Adapters may present those descriptors differently:

- Codex: dynamic tools or another app-server-compatible tool bridge
- Claude: MCP tools if/when Claude support returns
- CLI: existing `@contexture/cli` op commands

Do not create a second hand-maintained tool catalog.

### Turn Atomicity

The existing `ChatTurnController` invariant survives the rewrite:

- `turn:begin` opens one renderer transaction
- each accepted op applies and animates immediately
- `turn:commit` creates one undo entry
- `turn:rollback` discards all ops from that turn

Codex must also roll back provider conversation state for failed/interrupted turns. If the renderer rolls back but Codex remembers successful tool calls, the next turn can become semantically desynced.

### Provider Conversation Rollback

Codex app-server supports provider-side thread rollback. The Codex runtime must call it when a Contexture turn rolls back.

If provider rollback fails, the runtime should mark the provider thread as desynced and force a fresh Codex thread or inject the current IR as authoritative context on the next turn.

## Runtime Contract

Introduce a small provider runtime contract in Electron main. It should describe Contexture's needs, not mirror any one provider's protocol.

Suggested shape:

```ts
type ProviderKind = "codex" | "claude";

interface ProviderRuntime {
  provider: ProviderKind;
  capabilities: ProviderCapabilities;

  getStatus(): Promise<ProviderStatus>;
  listModels(): Promise<ModelInfo[]>;

  startThread(input: StartThreadInput): Promise<ProviderThreadRef>;
  sendTurn(input: SendTurnInput): AsyncIterable<ProviderRuntimeEvent>;
  interruptTurn(input: InterruptTurnInput): Promise<void>;
  rollbackThread(input: RollbackThreadInput): Promise<void>;

  startLogin(input: StartLoginInput): Promise<LoginFlow>;
  cancelLogin(input: CancelLoginInput): Promise<void>;
  logout(): Promise<void>;
}
```

Provider-native request payloads, notification names, thread ids, and auth details stay behind adapters.

The renderer should see only:

- provider status/readiness
- available models and provider-specific option metadata
- canonical chat events
- canonical tool-call status
- turn lifecycle events
- provider-scoped thread references

## Canonical Runtime Events

Normalize provider-native events into a small Contexture event vocabulary:

- `status_changed`
- `auth_changed`
- `thread_started`
- `thread_resumed`
- `turn_started`
- `assistant_delta`
- `assistant_final`
- `tool_call_started`
- `tool_call_finished`
- `turn_completed`
- `turn_failed`
- `turn_interrupted`
- `thread_desynced`

Provider-specific event detail may be logged for debugging, but it should not leak into renderer state or shared chat logic.

## Provider Capabilities

Expose provider differences through capabilities rather than shared-code conditionals.

Initial capabilities:

- `authModes`: ChatGPT, API key, CLI/session, or none
- `modelSource`: runtime-driven or static
- `supportsThreadResume`
- `supportsThreadRollback`
- `supportsDynamicTools`
- `supportsMcpTools`
- `supportsInterrupt`
- `supportsRateLimitStatus`
- `supportsReasoningEffort`
- `supportsSchemaOnlyMode`

The Codex runtime should drive the contract. Claude can be fit into it later where possible.

## Codex Runtime

Implement `CodexProviderRuntime` in Electron main.

Responsibilities:

- detect `codex` CLI presence and version
- enforce a minimum supported Codex CLI version
- generate or vendor app-server protocol types for the pinned version
- spawn and manage `codex app-server`
- initialize JSON-RPC over stdio
- route request/response ids
- handle server-initiated requests, including tool calls and approvals if enabled
- map app-server notifications into canonical runtime events
- start, resume, interrupt, and roll back threads
- read auth/account state from Codex
- start/cancel ChatGPT and API-key login flows through Codex
- list models from Codex where available
- surface ChatGPT rate-limit state where available
- restart or degrade cleanly when app-server exits

Codex should be the default provider once it can complete schema chat turns end to end.

## Codex Tool Strategy

Start with a spike before committing to the full adapter.

Spike goals:

1. Generate protocol types from the pinned Codex CLI.
2. Start `codex app-server`.
3. Initialize with the required stable capabilities, and with experimental capability only if dynamic tools require it.
4. Start a thread.
5. Send a turn with one minimal Contexture dynamic tool.
6. Confirm tool-call request/response behavior is reliable.
7. Confirm interrupt and provider rollback behavior.

Preferred v1 path:

- generate Codex dynamic tool specs from `createOpTools()`
- forward each tool call to the renderer op bridge
- return the renderer `ApplyResult` to Codex

Fallback path:

- expose Contexture op tools through an MCP adapter if dynamic tools are not stable enough

Either way, `createOpTools()` remains the source of truth.

## Safety and Containment

Schema chat must be constrained even though Codex is a coding agent.

Implementation requirements:

- run schema-chat turns with the strictest viable sandbox/profile
- deny or omit shell, filesystem, browser, web, and repo mutation tools
- do not enable full-access runtime modes in schema chat
- add tests or live smoke checks proving attempts to read files, write files, or run commands are unavailable or rejected
- treat hidden approval stalls or unsupported approval flows as runtime failures, not silent hangs

If Contexture later adds a coding-agent surface, it should have a separate runtime mode, separate UI, and separate user expectations.

## Auth and Readiness

Codex is the source of truth for Codex auth state.

Contexture should:

- support ChatGPT managed auth as the preferred path
- support API key fallback
- not store Codex credentials in localStorage or sidecars
- persist only lightweight UI preferences
- call Codex account/status APIs on startup and when the provider popover opens
- surface explicit readiness states
- surface rate-limit state when available

Codex readiness states:

- CLI missing
- CLI outdated
- app-server unavailable
- not signed in
- authenticated with ChatGPT
- authenticated with API key
- authenticated but rate-limited
- desynced thread

Claude readiness can be added later as a secondary provider state.

## Models and Provider Options

Models should be provider-specific and runtime-driven where possible.

Renderer state should store:

- active provider
- provider-specific selected model
- provider-specific reasoning/effort option
- provider-specific readiness
- provider-specific thread reference

Do not hardcode a Claude-oriented model list into shared chat state.

## Persistence

Replace the old Claude-shaped persistence outright.

No migration is required for:

- Claude Agent SDK session ids
- Claude auth mode localStorage keys
- Claude model localStorage keys
- Claude-only thread records

New thread records should be provider-aware:

```ts
interface SchemaAgentThreadRecord {
  id: string;
  provider: ProviderKind;
  providerThreadRef?: unknown;
  title: string;
  messages: ChatMessage[];
  model?: string;
  effort?: string;
  filePath: string | null;
  desynced?: boolean;
  createdAt: number;
  updatedAt: number;
}
```

The provider thread reference is opaque outside the provider runtime.

## Renderer and IPC Rewrite

Replace Claude-named renderer and IPC surfaces rather than gradually renaming them for compatibility.

Target names:

- `registerSchemaAgentIpc`
- `useSchemaAgentChat`
- `useProviderSettings`
- `useSchemaAgentThreads`
- `SchemaAgentPanel`

IPC should be provider-neutral:

- `schema-agent:send`
- `schema-agent:abort`
- `schema-agent:set-ir`
- `schema-agent:set-provider`
- `schema-agent:set-model-options`
- `schema-agent:get-status`
- `schema-agent:list-models`
- `schema-agent:start-login`
- `schema-agent:cancel-login`
- `schema-agent:logout`
- `schema-agent:tool-reply`
- `schema-agent:thread-set`
- `schema-agent:thread-clear`

Renderer event channels should likewise be provider-neutral:

- `schema-agent:assistant-delta`
- `schema-agent:assistant-final`
- `schema-agent:tool-call-started`
- `schema-agent:tool-call-finished`
- `schema-agent:error`
- `schema-agent:auth-required`
- `schema-agent:status-changed`
- `schema-agent:thread-updated`
- `schema-agent:tool-request`
- `turn:begin`
- `turn:commit`
- `turn:rollback`

The old `claude:*` channels can be removed as part of the rewrite.

## Claude Runtime

Claude support is optional after Codex is stable.

If restored, it should be implemented as `ClaudeProviderRuntime` behind the same provider contract. It should not force the shared contract to preserve Agent SDK-specific concepts such as Claude session ids, Claude-specific error classes, or Claude-specific model settings.

Claude-specific limitations should be exposed through capabilities.

If Claude cannot support provider-side conversation rollback, its runtime must either:

- restart the Claude session after rollback and treat the current IR as authoritative, or
- mark the thread desynced and require a fresh thread

## Reconcile and Eval

Codex support for reconcile/eval is out of scope for the first milestone.

Options:

- temporarily disable these features when Codex is active
- keep the old Claude implementation locally while clearly marking it secondary
- rebuild them after schema chat works end to end

Do not block Codex schema chat on reconcile/eval parity.

## Suggested Implementation Order

1. Pin a supported Codex CLI version.
2. Generate or vendor Codex app-server protocol types for that version.
3. Run the Codex app-server spike: initialize, auth read, model list, thread start, turn start, one tool call, interrupt, rollback.
4. Add provider-neutral main-side runtime interfaces and canonical events.
5. Implement `CodexProviderRuntime`.
6. Replace Claude-shaped IPC with `schema-agent:*` IPC.
7. Replace `useClaude*` renderer hooks with schema-agent/provider hooks.
8. Replace chat thread persistence with provider-aware records.
9. Wire Codex auth/readiness/model UI.
10. Generate the full Codex tool surface from `createOpTools()`.
11. Connect Codex tool calls to the existing renderer op bridge.
12. Preserve `ChatTurnController` turn atomicity and add provider rollback on failure/interrupt.
13. Add containment tests for forbidden shell/filesystem behavior.
14. Make Codex the default provider.
15. Remove obsolete Claude localStorage keys/channels/tests that no longer apply.
16. Reintroduce Claude as a secondary runtime only after Codex is stable.

## File Touchpoints

Expected high-change or replacement areas:

- [`apps/desktop/src/main/ipc/claude.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/main/ipc/claude.ts)
- [`apps/desktop/src/main/ipc/chat-driver.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/main/ipc/chat-driver.ts)
- [`apps/desktop/src/main/ipc/chat-turn.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/main/ipc/chat-turn.ts)
- [`apps/desktop/src/main/ipc/claude-bridge.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/main/ipc/claude-bridge.ts)
- [`apps/desktop/src/main/ipc/op-tool-bridge.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/main/ipc/op-tool-bridge.ts)
- [`apps/desktop/src/preload/index.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/preload/index.ts)
- [`apps/desktop/src/preload/index.d.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/preload/index.d.ts)
- [`apps/desktop/src/renderer/src/chat/useClaude.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/renderer/src/chat/useClaude.ts)
- [`apps/desktop/src/renderer/src/chat/useClaudeSchemaChat.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/renderer/src/chat/useClaudeSchemaChat.ts)
- [`apps/desktop/src/renderer/src/chat/useChatThreads.ts`](/Users/rufus/Apps/contexture/apps/desktop/src/renderer/src/chat/useChatThreads.ts)
- [`apps/desktop/src/renderer/src/components/chat/ChatPanel.tsx`](/Users/rufus/Apps/contexture/apps/desktop/src/renderer/src/components/chat/ChatPanel.tsx)
- [`packages/core/src/op-tools.ts`](/Users/rufus/Apps/contexture/packages/core/src/op-tools.ts)

Expected new modules:

- provider runtime interfaces
- provider runtime event types
- provider capabilities
- `CodexProviderRuntime`
- Codex app-server transport
- Codex app-server protocol generated types
- Codex auth/status service
- Codex dynamic-tool adapter
- schema-agent IPC registration
- schema-agent renderer hooks

## Testing Strategy

Focus tests around the new provider boundary and Contexture invariants.

Must-cover behaviors:

- Codex CLI missing/outdated status
- app-server initialize failure
- auth state update flow
- ChatGPT login flow event handling
- model list normalization
- thread start/resume
- assistant delta/final mapping
- dynamic tool call mapping
- op result mapping
- turn commit
- turn rollback
- provider-side thread rollback
- interrupt behavior
- desynced-thread handling
- forbidden shell/filesystem behavior
- renderer transaction binding
- provider-aware thread persistence

Use fake provider runtimes for shared contract tests. Keep Codex protocol translation tests adapter-specific.

## Definition of Done for First Codex Milestone

Codex is considered integrated when the desktop app can:

- detect supported Codex CLI presence and version
- show Codex auth/readiness in the provider popover
- authenticate via ChatGPT managed auth or API key
- list/select Codex models
- start a schema-agent chat turn
- stream assistant text into the transcript
- call Contexture op tools through the shared op registry
- update the graph incrementally as ops arrive
- commit a completed turn as one undo entry
- roll back renderer ops on interrupt/failure
- roll back Codex provider conversation state on interrupt/failure
- resume provider-scoped threads
- mark or recover from desynced provider threads
- prevent schema chat from using shell/filesystem/repo mutation tools

Everything else is out of scope for the first milestone.

## Risks and Watchpoints

### Dynamic Tool Stability

If Codex dynamic tools require experimental app-server APIs or have protocol drift, validate them before wiring the full op catalog.

### Provider/UI Desync

Renderer rollback without provider rollback can corrupt the assistant's understanding of the schema. Treat provider rollback as part of the turn transaction.

### Hidden Approval Stalls

If app-server can request approvals that the client cannot see or resolve, schema chat may hang. The constrained schema-agent profile should avoid approval-requiring built-ins entirely.

### Protocol Drift

Codex CLI releases move quickly. Pin a supported version, generate protocol types from that version, and hard-fail unsupported versions.

### Auth Complexity

Codex readiness depends on CLI version, app-server availability, active account mode, token freshness, and rate limits. Avoid reducing this to a single configured/unconfigured boolean.

### Over-Borrowing from T3Code

T3Code is a good provider architecture reference, but Contexture should not import its whole coding-agent orchestration model into schema chat.

## Immediate Next Step

Run the Codex app-server spike against a pinned CLI version, then build the provider-neutral schema-agent contract around the successful Codex path.
