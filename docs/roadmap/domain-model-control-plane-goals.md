# Domain-Model Control Plane Goals

This roadmap turns [ADR 0022](../adr/0022-contexture-domain-model-control-plane.md) into
Codex-sized goals. Each goal should be pursued as a small vertical slice:
set one active goal, implement it end to end, verify it, then update this
file with what changed and what the next goal should learn from it.

## Goal 1 — Drift Status Trust Layer

**Status:** Done in PR 259.

Make generated-file drift detection reliable, visible, and tested. Missing
or unreadable generated files must be surfaced as attention-worthy drift,
not silently treated as clean.

## Goal 2 — Reconcile Minimum Viable Flow

**Status:** Done.

Let users either regenerate a drifted generated file from the current IR or
leave it dirty. This goal is intentionally narrower than semantic
fold-back: it must be safe, obvious, and limited to generated targets.

Completion evidence:

- Reconcile UI offers `Regenerate from IR`.
- `Leave dirty` closes the modal without clearing drift or writing files.
- Unknown or user-owned targets cannot be overwritten by this flow.
- Tests cover regenerate, leave-dirty, and generated-target safety.

## Goal 2.5 — Provider-Neutral Reconcile Proposals

**Status:** Done.

Move reconcile proposals off the Claude-only IPC path and onto the active
schema-agent provider. The reconcile modal should use the same selected
provider, model, effort, and options as schema chat, without adding a
second model picker in the modal.

Completion evidence:

- Reconcile proposal requests are routed through a provider-neutral
  schema-agent path, not `ipc/claude.ts`.
- Active Codex and Claude provider/model settings are respected.
- If the active provider is unavailable, proposal generation fails
  explicitly while `Regenerate from IR` and `Leave dirty` remain usable.
- Tests cover Codex routing, Claude routing, and unavailable-provider
  fallback behavior.

Notes:

- The preload `contexture.reconcile.query` bridge now invokes
  `schema-agent:reconcile`, preserving the renderer API while removing
  the Claude-only IPC handler.
- Provider runtimes expose a no-tools `generateText` path for isolated
  proposal generation. Normal schema chat still uses provider threads and
  Contexture op tools.

## Goal 3 — CLI/Agent Drift Contract

**Status:** Done.

Expose machine-readable drift status for CI and coding agents. The CLI
should report path, status, and a non-zero exit when generated files drift
or become unreadable.

Completion evidence:

- `contexture check-generated --json` reports every generated target as
  `{ path, status }`, where status is `clean`, `drifted`, or `unreadable`.
- Drifted or unreadable generated targets set a non-zero exit code.
- The older `stale` JSON field remains for compatibility while agents can
  consume the new `files` and `drift` arrays directly.

## Goal 4 — MCP Inspect/Validate Server

**Status:** Done.

Ship a minimal MCP surface over `@contexture/core` that can inspect and
validate a `.contexture.json` file without the desktop app running.

Completion evidence:

- `@contexture/cli` now ships a `contexture-mcp` stdio server.
- The server exposes read-only `inspect_contexture` and
  `validate_contexture` tools backed by `@contexture/core`.
- Tests exercise the MCP server with an in-memory MCP client, independent
  of the desktop app.

## Goal 4.5 — Packaged MCP Entry Point

**Status:** Done.

Make the MCP server accessible from an installed Contexture app, not just
from a source checkout. Agents need one stable, centrally installed command
to register after the user has created a `.contexture.json` file.

Target registration shape:

```bash
codex mcp add contexture -- /Applications/Contexture.app/Contents/MacOS/Contexture --mcp
```

Completion evidence:

- The packaged macOS app can launch the MCP stdio server via `--mcp`
  without opening the desktop window.
- The Electron main entrypoint routes `--mcp` to the shared
  `@contexture/core/mcp-server` factory before loading the desktop UI.
- The built `apps/desktop/out/main/index.js --mcp` runtime does not require
  `bun` or dev-only TypeScript execution.
- The registered installed-app command exposes the same
  `inspect_contexture` and `validate_contexture` tools as Goal 4.
- Tests cover the `--mcp` launch flag, CLI MCP compatibility, and a built
  main-process smoke test against `inspect_contexture`.
- Developer docs explain how agents register and smoke-test the installed
  MCP server.

## Goal 5 — MCP Mutation/Emit Loop

**Status:** Done.

Let agents mutate the IR through the closed-world op vocabulary, emit the
bundle, and check drift. The agent loop should be: inspect, apply op,
validate, emit, check drift.

Completion evidence:

- The shared MCP server exposes `apply_contexture_op`, `emit_contexture`, and
  `check_contexture_drift` alongside inspect/validate.
- `apply_contexture_op` writes through `createFileBackedForward`, so MCP
  mutations use the same closed-world op reducer and generated bundle path as
  the CLI.
- MCP tests exercise the full inspect/apply/emit/check loop against a temporary
  `.contexture.json` project.
- Agent docs describe the registered tool loop and example op payload.

## Goal 6 — Opt-In Output Config

**Status:** Done.

Add the IR shape for target-specific emit configuration. Existing outputs
should preserve current behavior; new AI-pipeline outputs should be opt-in.

Completion evidence:

- The IR accepts an optional top-level `outputs` config with current emit target
  switches and future AI-pipeline target slots.
- Omitted output config preserves the existing emitted bundle.
- Current generated targets can be disabled explicitly and are removed from the
  emitted manifest/drift surface.
- AI-pipeline target slots round-trip through load/save but do not emit files
  until Goal 7 adds the first opt-in emitter.

## Goal 7 — First AI-Pipeline Emitter

**Status:** Done.

Add one high-value opt-in generated target for AI engineers, such as
tool-call schema helpers or structured-output helper definitions. The new
target must participate in the emit manifest and drift detection.

Completion evidence:

- `outputs.aiPipeline.toolSchemas.enabled` emits
  `.contexture/ai-tool-schemas.json`.
- The generated document contains provider-neutral per-type tool definitions
  backed by JSON Schema parameters.
- The new file participates in the emitted manifest and existing drift checks.
- The target remains omitted unless explicitly enabled.

## Goal 8 — Dogfood One Real Product

**Status:** Done.

Use Contexture CLI/MCP to make one real schema change in an Applification
product. The change should start from the IR, regenerate artifacts, pass
drift checks, and feed sharp edges back into Contexture.

Completion evidence:

- Dogfooded against Recordshop's `packages/contexture/recordshop.contexture.json`.
- Used the Contexture CLI to add `Release.discogsReleaseId` and a
  `by_discogs_release_id` Convex index from the IR.
- Regenerated Recordshop's Zod, JSON Schema, index, Convex schema, and emitted
  manifest artifacts.
- Recordshop passes `validate` and the strengthened `check-generated` drift
  check.
- Fed back one Contexture sharp edge: CLI/MCP drift checks now include
  `.contexture/emitted.json`, so stale manifests cannot silently narrow the
  desktop watcher surface.
- Product typecheck was attempted, but Recordshop's top-level
  `packageManager: "bun"` currently blocks Turbo before TypeScript runs.

## Goal 9 — Marketing Rewrite

**Status:** Done.

Rewrite public positioning only after the trust layer, agent loop, and at
least one AI-pipeline output are credible. The site should sell: "Design
your domain once. Ship it everywhere."

Completion evidence:

- Rewrote the homepage hero around "Design your domain once. Ship it
  everywhere."
- Shifted public positioning from "visual Zod schema editor" to
  "domain-model control plane for AI-native TypeScript apps."
- Updated homepage sections to cover source-of-truth IR, closed-world agent
  ops, app-ready emit targets, MCP, AI tool schemas, manifest-backed drift
  checks, and Recordshop dogfooding.
- Updated site metadata, brand phrase guidance, README copy, and homepage smoke
  tests to match the new positioning.

## Goal 10 — Agent/Electron Trust Envelope

**Status:** Done.

Harden the writable trust envelope opened by the agent loop and desktop
project flows. Contexture now exposes real mutation surfaces through MCP, CLI,
schema chat, reconcile, and Electron IPC; those surfaces need explicit path,
protocol, and destructive-action guards before the next architecture
simplification pass.

Completion evidence:

- Reconcile generated-file reads/writes route through main-side IPC that only
  accepts known generated targets for the open `.contexture.json` bundle.
- Recursive project deletion rejects root, home, non-absolute, and non-directory
  targets even if the renderer misbehaves.
- Window-open external links are limited to expected external protocols.
- Tests cover allowed and rejected paths/protocols.
- MCP/CLI mutation and emit paths have explicit path-policy tests for accepted
  `.contexture.json` inputs and rejected output locations.

Progress:

- Reconcile now uses main-side generated-target IPC instead of legacy preload
  filesystem reads/writes.
- Project recursive delete now fails closed for root, home, relative, top-level,
  current-working-directory, and file targets.
- External window-open handling now denies non-http/mailto protocols.
- CLI and MCP now share core path policy: read-only operations accept resolved
  `.contexture.json` inputs, while write-capable agent operations require
  `packages/contexture/*.contexture.json`.
- Tests cover non-IR path rejection, scratch-file read-only inspection, and
  write-capable CLI/MCP rejection for scratch IR paths.

Next goal candidate:

- Deepen the shared generated-bundle writer so desktop, CLI, and MCP all share
  one atomic write and drift preflight implementation.
