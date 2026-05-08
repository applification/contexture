# Codex Provider Support Plan

- **Status:** Proposed
- **Date:** 2026-05-02

## Goal

Add Codex as a second chat provider in the desktop Electron app while preserving Contexture's current product contract:

- chat edits the in-memory schema through the closed-world op vocabulary
- graph updates animate per op
- one chat turn maps to one undoable transaction
- stop / interrupt rolls back the whole in-flight turn

The implementation should follow the same high-level separation used by `t3code`: one UI surface, separate provider runtimes, provider-specific auth/model state, and a provider-neutral renderer contract.

## Agreed decisions

### Product and scope

- Introduce multiple provider support now, starting with `Codex`.
- Keep provider runtimes separate, not unified internally.
- Start Codex in constrained schema-agent mode only.
- Expose only Contexture schema op tools to Codex at first.
- Defer broader coding-agent capabilities to a separate future surface.
- Defer Codex support for reconcile/eval flows until the main schema chat path is proven.

### Runtime architecture

- Refactor to a provider-neutral boundary before adding Codex behavior.
- Keep the existing Claude implementation behind `ClaudeProviderRuntime`.
- Implement Codex through `codex app-server`, not `codex exec`.
- Run one long-lived Codex `app-server` child process per app window.
- Wrap that process in a main-side runtime service that owns lifecycle, transport, thread mapping, auth polling, interrupt, and tool dispatch.
- Keep the renderer isolated from provider processes.

### Tooling and turn semantics

- Reuse `createOpTools()` as the single source of truth for both providers.
- Claude continues using Agent SDK + MCP tools.
- Codex uses dynamic tools generated from the same descriptors.
- Reuse the existing `ChatTurnController` transaction envelope for both providers.
- Preserve current stop semantics: partial tool effects are provisional until turn completion and are rolled back on interrupt or failure.

### Auth and readiness

- Use a unified auth popover with provider-specific content.
- Keep auth state provider-specific.
- Support Codex `ChatGPT subscription` login with `API key` fallback.
- Use Codex as the source of truth for auth state.
- Do not store Codex credentials in Contexture local storage.
- Persist only lightweight UI preferences in Contexture.
- Query provider auth/account state on startup and when the popover opens.
- Show explicit readiness states instead of a single configured/unconfigured bit.

### Models and persistence

- Make models provider-specific and runtime-driven.
- Replace the current thread persistence shape outright with a provider-aware format.
- No backward-compat migration work is required.
- Rename Claude-specific code paths and storage keys to provider-neutral names as part of the refactor.

### Versioning and protocol

- Pin to a minimum supported Codex CLI version.
- Hard-fail Codex into an unavailable state if the installed CLI is too old.
- Updating the local Codex CLI to the pinned version is acceptable and expected.
- Generate or vendor Codex app-server protocol types instead of hand-maintaining request shapes.

## External references

- Codex auth docs: ChatGPT sign-in and API key sign-in are both supported for CLI/app/IDE.
- Codex app-server docs: primary integration path for embedded clients.
- Codex GitHub repo: local CLI releases move quickly, so version pinning matters.
- `t3code`: useful reference for provider separation and unified UI shape.

## Non-goals for v1

- No general filesystem, shell, or repository mutation from the Contexture chat surface.
- No attempt to force Claude and Codex onto one lower-level runtime.
- No backward-compat persistence migration for old Claude-only thread records.
- No Codex parity for reconcile/eval before the main schema chat path works end to end.

## Target UX

### Unified auth popover

One popover with:

- provider switcher
- provider-specific auth controls
- provider-specific model selector
- provider-specific effort selector
- provider-specific readiness and error state

Codex readiness states:

- CLI missing
- CLI outdated
- not signed in
- authenticated with ChatGPT
- authenticated with API key

Claude keeps equivalent provider-specific readiness states.

### Provider behavior

- The active provider is explicit in renderer state.
- Threads are provider-scoped.
- Session ids are provider-scoped.
- Switching provider swaps available models and auth state presentation.
- Claude remains the default selected provider until Codex reaches parity on the main schema chat flow.

## Architecture plan

### 1. Introduce provider-neutral contracts

Create a minimal provider contract in main and preload. Normalize only the events Contexture actually needs:

- `status`
- `assistant_delta`
- `assistant_final`
- `tool_call_started`
- `tool_call_finished`
- `turn_started`
- `turn_committed`
- `turn_rolled_back`
- `turn_failed`
- `session_updated`
- `auth_state_updated`

Provider-native detail should stay behind the main-side runtime boundary unless the renderer actually needs it.

### 2. Rename Claude-shaped plumbing

Refactor existing Claude-specific names to provider-neutral ones first:

- `claude:*` IPC channels
- preload chat/auth methods
- `useClaude*` hooks
- Claude-specific store keys
- provider-specific copy in shared chat components

The goal is to keep behavior stable while changing the shape of the boundary.

### 3. Adapt Claude to the new boundary

Wrap the current Agent SDK + MCP integration in `ClaudeProviderRuntime`.

Preserve:

- current auth flow
- current tool behavior
- current turn transaction semantics
- current interrupt rollback behavior

This phase should not add new product behavior. It is a containment refactor.

### 4. Add the Codex runtime service

Implement `CodexProviderRuntime` in Electron main:

- spawn `codex app-server`
- perform initialize handshake
- manage JSON-RPC request ids
- map server notifications to normalized events
- manage long-lived provider thread ids
- support turn start and interrupt
- support provider auth/account queries
- support provider login/logout actions
- enforce minimum CLI version

This service should also handle process restart and degraded unavailable states cleanly.

### 5. Reuse the shared op registry for dynamic tools

Keep [`packages/core/src/op-tools.ts`](/Users/davehudson/Apps/Contexture/packages/core/src/op-tools.ts) as the single source of truth.

Adapters:

- Claude adapter: existing MCP `tool(...)` wrapping
- Codex adapter: dynamic tool spec generation plus tool-call response handling

Do not create a second hand-maintained tool catalog.

### 6. Keep the existing turn transaction model

Map both providers into the same `ChatTurnController` envelope so:

- every completed turn commits as one undo entry
- every interrupted or failed turn rolls back
- per-op animation remains incremental

This preserves the strongest user-facing invariant in the current product.

### 7. Replace renderer/provider state

Add explicit provider-aware renderer state:

- `activeProvider`
- provider-specific auth mode and readiness
- provider-specific selected model
- provider-specific effort setting
- provider-specific session id
- provider-aware thread records

The persistence format can be replaced outright because migration compatibility is not required.

### 8. Land the unified auth popover

The popover should:

- switch provider
- show provider-specific readiness
- initiate provider login/logout flows
- allow Codex ChatGPT or API key auth selection
- keep Contexture as the owner of UI state only, not credentials

Codex login/logout should be initiated through the Codex runtime where possible, with manual terminal instructions only as fallback copy.

## Suggested implementation order

1. Pin and install the supported Codex CLI version locally.
2. Add a new plan/protocol module for Codex app-server types and version checks.
3. Introduce provider-neutral interfaces in main/preload.
4. Rename Claude-specific renderer and preload surfaces to neutral names.
5. Wrap the current Claude flow in `ClaudeProviderRuntime`.
6. Add provider-aware renderer state and thread persistence.
7. Add unified auth popover with provider switching.
8. Implement the long-lived Codex runtime service.
9. Generate Codex dynamic tools from `createOpTools()`.
10. Connect Codex normalized events to the shared renderer contract.
11. Add focused tests around the provider boundary.
12. Verify Claude behavior still matches current semantics.
13. Verify Codex can authenticate, stream text, call op tools, resume threads, and roll back on interrupt.

## File touchpoints

Expected high-change areas:

- [`apps/desktop/src/main/ipc/claude.ts`](/Users/davehudson/Apps/Contexture/apps/desktop/src/main/ipc/claude.ts)
- [`apps/desktop/src/main/ipc/chat-driver.ts`](/Users/davehudson/Apps/Contexture/apps/desktop/src/main/ipc/chat-driver.ts)
- [`apps/desktop/src/main/ipc/chat-turn.ts`](/Users/davehudson/Apps/Contexture/apps/desktop/src/main/ipc/chat-turn.ts)
- [`apps/desktop/src/preload/index.ts`](/Users/davehudson/Apps/Contexture/apps/desktop/src/preload/index.ts)
- [`apps/desktop/src/preload/index.d.ts`](/Users/davehudson/Apps/Contexture/apps/desktop/src/preload/index.d.ts)
- [`apps/desktop/src/renderer/src/chat/useClaude.ts`](/Users/davehudson/Apps/Contexture/apps/desktop/src/renderer/src/chat/useClaude.ts)
- [`apps/desktop/src/renderer/src/chat/useClaudeSchemaChat.ts`](/Users/davehudson/Apps/Contexture/apps/desktop/src/renderer/src/chat/useClaudeSchemaChat.ts)
- [`apps/desktop/src/renderer/src/chat/useChatThreads.ts`](/Users/davehudson/Apps/Contexture/apps/desktop/src/renderer/src/chat/useChatThreads.ts)
- [`apps/desktop/src/renderer/src/components/chat/ChatPanel.tsx`](/Users/davehudson/Apps/Contexture/apps/desktop/src/renderer/src/components/chat/ChatPanel.tsx)
- [`packages/core/src/op-tools.ts`](/Users/davehudson/Apps/Contexture/packages/core/src/op-tools.ts)

Expected new modules:

- provider-neutral runtime interfaces
- `ClaudeProviderRuntime`
- `CodexProviderRuntime`
- Codex app-server transport/service
- Codex protocol/version support modules

## Testing strategy

Focus first on the shared provider boundary rather than reproducing the full Claude test matrix for Codex immediately.

Must-cover behaviors:

- normalized event mapping
- auth state update flow
- thread/session update flow
- turn commit
- turn rollback
- interrupt behavior
- tool call dispatch and result mapping
- degraded unavailable state on missing/outdated Codex CLI

Provider-specific tests should stay thinner under the shared contract.

## Definition of done for first Codex milestone

Codex is considered integrated when the desktop app can:

- detect supported Codex CLI presence and version
- show Codex auth/readiness in the unified popover
- authenticate via ChatGPT or API key
- start a schema chat turn
- stream assistant text into the transcript
- call Contexture op tools through dynamic tools
- update the graph incrementally
- resume provider-scoped threads
- roll back the whole turn on interrupt or failure

Everything else is out of scope for the first milestone.

## Risks and watchpoints

### Protocol drift

Codex CLI releases move quickly. The app-server protocol should be treated as versioned and pinned.

### Strict request encoding

The local probe already showed strict union decoding in app-server request payloads. Hand-rolled request bodies are likely to fail in subtle ways.

### Auth complexity

Codex readiness is not just "binary exists." It depends on CLI version plus provider auth/account state from the runtime.

### Refactor size

The current chat stack is deeply Claude-shaped. The rename/extraction pass is real work and should not be minimized in planning.

## Immediate next step

Start with the provider-neutral rename and boundary extraction, then adapt Claude behind it before introducing any Codex runtime behavior.
