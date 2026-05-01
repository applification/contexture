# ADR 0005: Zod meta-schema is the authoritative IR; TS types via `z.infer`

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The IR (TypeDef, FieldDef, FieldType, ImportDecl, …) is consumed at three boundaries:

- Loaded from disk (`.contexture.json`), where input may be malformed, partially migrated, or hand-edited.
- Mutated by the ops reducer, which must reject invalid ops before they corrupt the live store.
- Sent across IPC and through MCP tool calls, where the input is opaque until validated.

If the IR is described by hand-written TypeScript types alone, every boundary needs a separate runtime validator and the validator can drift from the type. Adding a new `TypeDef` kind becomes synchronised edits across two files.

## Decision

The Zod meta-schema in `packages/core/src/ir.ts` is the single source of truth. TypeScript types are derived via `z.infer<>`. `IRSchema.parse(x)` is the only sanctioned entry point for untrusted input; it returns a typed `Schema` or throws `ZodError` with path-addressable issues.

Adding a new `TypeDef` kind, `FieldType`, or constraint is a single edit to the Zod schema; the type updates automatically.

## Consequences

- Validator and type can never drift.
- Path-addressable Zod errors map cleanly onto the renderer's field-level validation UI.
- Recursive types (`array.element` referencing `FieldType`) need `z.lazy` plus a hand-written union type to break the circularity for TypeScript — accepted as a localised workaround in `ir.ts`.
- One narrow case (`ImportDecl`'s `path: \`@contexture/${string}\``) keeps a hand-written type that is narrower than what Zod infers; the regex enforces the same invariant at runtime.

## Alternatives considered

- **Hand-written TS types + ad-hoc validators at each boundary:** drift risk, duplicated effort, weaker errors.
- **JSON Schema as source, generate TS:** extra build step, weaker ergonomics, no parsing helper.
- **TypeBox or Effect Schema:** comparable, but Zod is already in dependencies for end-user emitted code, so reusing it avoids a second schema library in the runtime.
