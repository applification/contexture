# ADR 0008: Ops reducer is pure and returns `{schema} | {error}`, never throws

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The ops reducer (`apply(schema, op)`) is called from many sites with different error-handling needs:

- The Zustand store wants to commit on success and surface a string on failure.
- The schema-agent bridge wants to send the error back as a tool result so the
  model can recover on the next turn.
- Tests want to assert on outcomes without try/catch noise.
- The undo stack wants to know whether an op succeeded before pushing it.

If `apply` throws on validation failure, every caller wraps it in try/catch and re-derives the same handling.

## Decision

`apply(schema, op)` is pure: takes the current schema and an op, returns either
`{ schema }` (the new IR) or `{ error: string }` (a message safe to surface to
the user or to an agent). It never throws for op-validation reasons. Callers
branch on the discriminator.

`replace_schema` runs the Zod meta-schema internally; structural failures become
`{error}` results, not exceptions. Semantic rules (unresolved refs, duplicate
names) live in `packages/core/src/semantic-validation.ts` so every adapter can
surface path-addressable issues after the replacement lands.

## Consequences

- The store is dumb: `if ('schema' in res) set({ schema: res.schema }); return res;` — that's the whole transaction.
- Agent tool results map directly: success returns the new IR summary, failure
  returns the error string verbatim for the model to react to.
- Undo only pushes successful ops, no try/catch.
- Cost: the reducer must explicitly handle every failure mode. Accepted — the failure modes are the API.

## Alternatives considered

- **Throw on validation errors:** every caller writes the same try/catch. Errors crossing IPC need re-serialising.
- **Return `null` on failure, log internally:** loses the error message that needs to reach the user/model.
- **Result type from a library (neverthrow, fp-ts):** adds a dependency and ceremony for a two-variant union we can write inline.
