# ADR 0003: `@contexture/core` as the shared IR kernel, mirrored under `renderer/src/model/`

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The IR meta-schema, op vocabulary, ops reducer, loader, migrations, paths, and emitters are needed by:

- The Electron main process (IPC layer, MCP op tools, document store, scaffold pipeline).
- The renderer (Zustand store, validation, on-screen graph rendering, undo).
- The CLI.
- Tests.

These are pure modules — no Electron, no DOM. They belong in a workspace package.

But the renderer also wants short, stable import paths (`@renderer/model/ir`) for ergonomics, and historically the IR lived in the renderer before it was extracted. A flag-day rename of every renderer import would create churn without changing behaviour.

## Decision

`packages/core` is the canonical home for the IR/ops/emit kernel. The renderer keeps a `model/` directory whose files re-export from `@contexture/core` (e.g. `renderer/src/model/ir.ts` is a single `export * from '@contexture/core/ir'` line).

New IR/ops code lands in `@contexture/core`. The renderer mirror exists only as an import-path alias and is allowed to add app-specific helpers (e.g. `preflight-error-copy.ts`) that don't belong in the shared kernel.

## Consequences

- Main process, CLI, and tests get the kernel via a normal workspace dep.
- The renderer keeps short `@renderer/model/...` imports; refactors that move things between core and the renderer mirror are local edits.
- Cost: two paths to the same symbol. Contributors must know that `@renderer/model/ir` is *not* a different IR — it is the same one. CODING_STANDARDS calls this out.

## Alternatives considered

- **Delete the mirror, import `@contexture/core` everywhere in the renderer:** noisier imports and a large flag-day diff for no behavioural gain.
- **Keep the IR only in the renderer:** breaks main-process and CLI consumers that need the same code without booting React.
