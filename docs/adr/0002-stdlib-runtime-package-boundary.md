# ADR 0002: `stdlib` owns implementation; `runtime` is a thin re-export

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Contexture ships curated reusable types (money, identity, contact, place, common) that end users import into their generated schemas. These types need two lives:

1. Inside Contexture itself (the editor, the emitters, validation, the chat system prompt all reference them).
2. Outside Contexture, published as `@contexture/runtime` on npm, imported by user projects at runtime.

If both consumers reach into the same package directly, the published surface bloats with editor-only utilities and the editor's import paths leak into user code.

## Decision

`packages/stdlib` owns all implementation — the Zod schemas, IR JSON for each module, registry, and helper data (countries, currencies). `packages/runtime` is a thin re-export layer published to npm. Dependencies flow strictly one way: `apps/* → runtime → stdlib`. Apps never import `stdlib` directly.

This is enforced as a coding standard (`.sandcastle/CODING_STANDARDS.md`) and visible in the package layout — `packages/runtime/src` only re-exports the subset users need.

## Consequences

- The published npm surface is small and intentional; editor-only data (e.g. registry metadata for the chat system prompt) doesn't leak to consumers.
- Renaming or restructuring inside stdlib is safe — only `runtime`'s re-exports are public API.
- One extra hop for editor code, but the indirection is mechanical (a re-export line) and pays for itself the first time we add internal-only stdlib utilities.

## Alternatives considered

- **Single package, mark some exports `@internal`:** doesn't actually prevent imports; relies on discipline.
- **Two parallel packages with no dependency:** would force duplicating the curated types or copy-pasting at build time.
- **Apps import stdlib directly, runtime is just a publishing alias:** breaks the invariant that the published surface is intentional — anything stdlib exports becomes implicitly public.
