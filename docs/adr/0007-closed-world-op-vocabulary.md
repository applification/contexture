# ADR 0007: Closed-world schema edited via a small op vocabulary

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Two channels mutate the IR: the human (clicking, typing, dragging in the renderer) and Claude (chat turns producing structured edits). They must converge on the same model. We need:

- An undo stack that can replay edits.
- A clear diff Claude can describe in natural language ("I added a `User` class with three fields").
- A validation surface that can reject bad edits before they corrupt the live store.
- A persistence story — what gets saved, what gets logged.

Two extreme designs sit at the ends of the spectrum: free-form patches (JSON Patch over the whole IR) or per-field RPCs.

## Decision

Define a closed `Op` discriminated union in `packages/core/src/ops.ts` covering exactly the mutations the editor supports: `add_type`, `update_type`, `rename_type`, `add_field`, `add_import`, `set_table_flag`, `replace_schema`, etc. Every channel — UI, chat IPC, MCP tools, undo — dispatches through `apply(schema, op)`.

Each op mutates one well-defined region. `rename_type` is the deliberate exception because a rename must cascade atomically through local refs and discriminated-union variants.

## Consequences

- Claude's tool surface is the same op set the UI uses — one validator, one replay engine, one audit trail.
- Undo is "apply the inverse op" rather than "diff and reconstruct".
- Adding a new editing capability is a single new op variant + reducer case + tool registration — easy to grep for and easy to test.
- Cost: any edit the user can imagine but the op set doesn't model is a feature request, not a bypass. Accepted — closed-world is the point.

## Alternatives considered

- **JSON Patch:** maximum flexibility, minimum semantics. Claude could produce unintelligible patches; validation becomes whole-IR-shape only; undo is generic but rename-cascade has to be reinvented.
- **Free-form Claude output ("here's the new IR"):** loses the per-edit granularity needed for animation, undo, and audit.
- **Per-field RPCs:** hundreds of methods, no discriminated union to grep.
