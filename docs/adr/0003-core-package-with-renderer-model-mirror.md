# ADR 0003: `@contexture/core` as the shared IR kernel, mirrored under `renderer/src/model/`

- **Status:** Superseded by the single-PR consolidation
- **Date:** 2026-05-01

## Supersession note

The renderer mirror described here was removed during the single-PR roadmap
consolidation. Renderer code now imports IR, load, migrations, and emitters
directly from `@contexture/core/*`. Renderer-local model helpers that do not
belong in core, such as layout, chat history, scaffold labels, project-name
validation, and preflight copy, remain under `apps/desktop/src/renderer/src/model/`.

The still-active part of this ADR is that `packages/core` is the canonical home
for shared IR, ops, validation, emitters, bundle paths, drift metadata, and MCP
operations. The mirror itself is historical.

## Context

The IR meta-schema, op vocabulary, ops reducer, loader, migrations, paths, and emitters are needed by:

- The Electron main process (IPC layer, MCP op tools, document store, scaffold pipeline).
- The renderer (Zustand store, validation, on-screen graph rendering, undo).
- The CLI.
- Tests.

These are pure modules — no Electron, no DOM. They belong in a workspace package.

At the time, the renderer wanted short, stable import paths (`@renderer/model/ir`) for ergonomics, and historically the IR lived in the renderer before it was extracted. A flag-day rename of every renderer import would have created churn without changing behaviour.

## Decision

`packages/core` became the canonical home for the IR/ops/emit kernel. The renderer initially kept a `model/` directory whose files re-exported from `@contexture/core` (e.g. `renderer/src/model/ir.ts` was a single `export * from '@contexture/core/ir'` line).

New IR/ops code landed in `@contexture/core`. The renderer mirror existed only as an import-path alias and was allowed to add app-specific helpers (e.g. `preflight-error-copy.ts`) that did not belong in the shared kernel.

## Consequences

- Main process, CLI, and tests got the kernel via a normal workspace dep.
- The renderer temporarily kept short `@renderer/model/...` imports; that mirror has since been removed.
- Cost: two paths to the same symbol. Contributors had to know that `@renderer/model/ir` was *not* a different IR — it was the same one.

## Alternatives considered

- **Delete the mirror, import `@contexture/core` everywhere in the renderer:** noisier imports and a large flag-day diff for no behavioural gain.
- **Keep the IR only in the renderer:** breaks main-process and CLI consumers that need the same code without booting React.
