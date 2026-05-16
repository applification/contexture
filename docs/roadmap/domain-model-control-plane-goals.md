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

Expose machine-readable drift status for CI and coding agents. The CLI
should report path, status, and a non-zero exit when generated files drift
or become unreadable.

## Goal 4 — MCP Inspect/Validate Server

Ship a minimal MCP surface over `@contexture/core` that can inspect and
validate a `.contexture.json` file without the desktop app running.

## Goal 5 — MCP Mutation/Emit Loop

Let agents mutate the IR through the closed-world op vocabulary, emit the
bundle, and check drift. The agent loop should be: inspect, apply op,
validate, emit, check drift.

## Goal 6 — Opt-In Output Config

Add the IR shape for target-specific emit configuration. Existing outputs
should preserve current behavior; new AI-pipeline outputs should be opt-in.

## Goal 7 — First AI-Pipeline Emitter

Add one high-value opt-in generated target for AI engineers, such as
tool-call schema helpers or structured-output helper definitions. The new
target must participate in the emit manifest and drift detection.

## Goal 8 — Dogfood One Real Product

Use Contexture CLI/MCP to make one real schema change in an Applification
product. The change should start from the IR, regenerate artifacts, pass
drift checks, and feed sharp edges back into Contexture.

## Goal 9 — Marketing Rewrite

Rewrite public positioning only after the trust layer, agent loop, and at
least one AI-pipeline output are credible. The site should sell: "Design
your domain once. Ship it everywhere."
