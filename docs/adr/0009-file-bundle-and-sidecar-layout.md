# ADR 0009: `.contexture.json` source-of-truth + `.contexture/` sidecars + emitted `.schema.{ts,json}`

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

A Contexture document needs to persist:

- The IR itself (canonical, hand-readable, diff-friendly).
- Editor state — graph layout, chat history — that the user shouldn't have to think about.
- Generated artefacts that downstream code imports — Zod `.schema.ts`, JSON Schema `.schema.json`, Convex schema, a barrel index.
- A manifest of generated artefacts for drift detection.

Mixing all of this into one file would conflict every time the layout shifts a node. Hiding everything inside an opaque binary blob would defeat git review. Putting the editor state in user-visible files would clutter their tree.

## Decision

For an IR file `Foo.contexture.json` the bundle is:

- `Foo.contexture.json` — the IR. Source of truth. Committed by the user.
- `.contexture/layout.json` — graph layout sidecar.
- `.contexture/chat.json` — chat history sidecar.
- `.contexture/emitted.json` — SHA-256 manifest of generated artefacts (see ADR 0010).
- `Foo.schema.ts` and `Foo.schema.json` — generated artefacts, written alongside the IR for ergonomic imports.

Path conventions live in `packages/core/src/paths.ts`. The `DocumentStore` (`apps/desktop/src/main/documents/document-store.ts`) writes the whole bundle atomically.

## Consequences

- The user's diff on a typical edit is small and readable: the IR plus, optionally, the emitted artefacts.
- The `.contexture/` directory is the natural unit to gitignore if a user prefers to regenerate locally.
- Emitted files sitting next to the IR mean downstream code does `import { Foo } from './Foo.schema'` — no extra path indirection.
- Cost: five files to manage instead of one. The atomic write in `DocumentStore` exists specifically to keep them coherent.

## Alternatives considered

- **One file with everything embedded:** layout shifts conflict on every save; emitted artefacts can't be imported directly.
- **Sidecars inside a hidden `.contexture` next to each IR vs a project-wide `.contexture/`:** per-IR keeps the relationship local and simple; project-wide would force a name-mangling scheme.
- **Emit to a separate `dist/` directory:** breaks the "import the schema next to the source" ergonomic.
