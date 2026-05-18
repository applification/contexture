# Contexture Core + CLI + Agent Workflow Plan

## Goal

Make Contexture the source of truth for downstream app domain models, so coding agents can inspect or change the domain model first, then regenerate Convex, Zod, and JSON Schema artifacts reliably.

Scope: **Phase 1, Phase 2, and Phase 3 only**.

Status legend: ✅ done · 🟡 partial · ⛔ not started

---

# Phase 1 — Extract `@contexture/core` ✅

## Outcome

All pure domain-model logic lives in `packages/core/` and is consumed by the desktop app, the CLI, and tests. No Electron, React, Zustand, IPC, or DOM imports leak into core.

## What shipped

```txt
packages/core/
  package.json
  tsconfig.json
  src/
    index.ts
    ir.ts
    load.ts
    migrations/
    ops.ts
    op-tools.ts
    semantic-validation.ts
    pipeline.ts
    paths.ts
    file-forward.ts
    emit-zod.ts
    emit-json-schema.ts
    emit-convex.ts
    emit-schema-index.ts
    generated-targets.ts
  tests/
    apply-semantic-gate.test.ts
    emit-stdlib-imports.test.ts
    file-forward.test.ts
    semantic-validation.test.ts
```

### Divergences from the original draft (kept on purpose)

- `validation.ts` was renamed to `semantic-validation.ts` to make the layer obvious.
- The original draft listed only Zod / JSON Schema / Convex emitters. Reality now ships more generated targets through `generated-targets.ts` and the emit pipeline.
- Two additional modules exist beyond the draft:
  - `pipeline.ts` — `runEmitPipeline(schema, irPath)` runs all emitters and returns a hashed `EmittedManifest` for drift detection.
  - `paths.ts` — single source of truth for bundle paths (`*.schema.ts`, `*.schema.json`, `convex/schema.ts`, `.contexture/{layout,chat,emitted}.json`).
  - `file-forward.ts` — `createFileBackedForward(irPath)` applies an op to disk transactionally.
  - `op-tools.ts` — `createOpTools(forward)` exposes each op as a typed tool (shared by CLI and the in-app agent surface).

## Public API

`packages/core/src/index.ts` re-exports everything; `package.json` also publishes subpath exports so callers can pull narrowly:

```ts
import {
  IRSchema,
  load,
  apply,
  createOpTools,
  createFileBackedForward,
  runEmitPipeline,
  bundlePathsFor,
} from '@contexture/core';
```

Subpaths available: `./ir`, `./load`, `./ops`, `./op-tools`, `./migrations`, `./semantic-validation`, `./pipeline`, `./paths`, `./file-forward`, `./generated-targets`, `./emit-zod`, `./emit-json-schema`, `./emit-convex`, `./emit-schema-index`.

## Desktop integration

The desktop renderer imports shared IR, load, migration, and emitter modules
directly from `@contexture/core/*`. Earlier re-export shims under
`apps/desktop/src/renderer/src/model/*.ts` were removed during the single-PR
consolidation so the desktop app no longer has a mirror ownership layer for
core product logic.

## Exit criteria — met

- `@contexture/core` builds and typechecks.
- Desktop consumes core (via shims).
- No Electron / React / Zustand / IPC / DOM imports in `packages/core`.
- `bun run ci` (typecheck + test + biome) passes.

---

# Phase 2 — `@contexture/cli` ✅

## Outcome so far

`packages/cli/src/index.ts` is a single-file CLI wired to `@contexture/core`'s op-tools registry. It can read the IR, validate it, run the emit pipeline, and apply any structured op.

```txt
packages/cli/
  package.json     # bin: contexture -> ./src/index.ts (run via Bun)
  tsconfig.json
  src/index.ts
  tests/cli.test.ts
```

## What shipped

### IR discovery

If `--ir` is not passed, the CLI looks in `./packages/contexture/` then `./` for exactly one `*.contexture.json`. Fails loudly on zero or multiple matches.

### Commands (current)

Read helpers:

```bash
contexture list-types [--json]
contexture get-type <name> [--json]
contexture validate [--json]
contexture emit [--json]
```

Schema mutations (one subcommand per op — chosen over a generic `apply --op-json` for typed argv and no JSON-quoting):

```bash
contexture add-field <type> <name> <fieldTypeJson> [--optional] [--nullable]
contexture update-field <type> <field> <patchJson>
contexture delete-field <type> <field>
contexture reorder-fields <type> <fieldNamesJsonOrCsv>
contexture add-type <typeDefJson>
contexture update-type <name> <patchJson>
contexture rename-type <from> <to>
contexture delete-type <name>
contexture set-table-flag <type> <true|false>
contexture add-index <type> <name> <fieldsJsonOrCsv>
contexture remove-index <type> <name>
contexture update-index <type> <name> <patchJson>
contexture add-variant <union> <variant>
contexture set-discriminator <union> <field>
contexture add-value <type> <value> [description]
contexture update-value <type> <value> <patchJson>
contexture remove-value <type> <value>
contexture add-import <importDeclJson>
contexture remove-import <alias>
contexture replace-schema <schemaJson>
```

Mutations route through `createOpTools(createFileBackedForward(irPath))`, so the CLI, the desktop agent surface, and any future MCP wrapper share one validated apply path.

### Output contract

- `--json` produces `{ ok: true, ... }` envelopes; failures produce `{ ok: false, error: { message, code } }`.
- Exit code is `1` on any failure (validate failure, op rejection, parse error).
- Non-JSON mode prints terse human messages to stdout / errors to stderr.

### `emit` semantics

`emit` runs the full `runEmitPipeline` and writes through `createFileBackedForward`. There is intentionally no `--out` or per-target subcommand — outputs are determined by `bundlePathsFor(irPath)`. This keeps drift-tracking honest (one manifest, one bundle).

## Phase 2 additions (shipped in this PR)

- ✅ `contexture inspect` — one-shot human and `--json` summary of the
  schema (types, fields, enums, discriminated unions, raw types, imports).
- ✅ `contexture check-generated` — re-runs the emit pipeline in memory,
  compares each output against the file on disk, exits non-zero on
  drift with a list of `{ path, reason }` entries.
- ✅ `contexture apply --op-json | --op-file` — generic op entrypoint for
  callers that already have a serialized `Op`. Per-op subcommands remain
  the primary surface.
- ✅ `HELP` text lists every command.

## Not wired into root CI (by design)

`check-generated` lives in CI for *downstream apps*, not this monorepo.
This repo has stdlib IRs but no app-level IR + emit bundle, so there's
nothing here to check. The recommended wiring is documented in
`docs/agent-contexture-workflow.md`.

## Exit criteria — met

- `inspect`, `check-generated`, and `apply` ship with tests.
- Help text lists every command.
- `bun run ci` passes.

---

# Phase 3 — Agent workflow docs / skill ✅

## Outcome target

A coding agent in a downstream app can be pointed at a short doc (or skill) and immediately know: edit the model, not the generated files; use the CLI; run drift check before declaring done.

## What shipped

- ✅ `docs/agent-contexture-workflow.md` — the canonical workflow doc.
  Covers the rules, CLI surface, recommended loop, and the
  `check-generated` CI wiring pattern for downstream apps.
- ✅ Emitter header audit. Generated emitters carry `@contexture-generated`;
  optional guidance emitters are not written automatically by the Document
  bundle lifecycle.
- Optional skill (`skills.sh` `contexture-integration`) is still open and is the
  preferred home for repo mutation guidance.

## Exit criteria — met

- `docs/agent-contexture-workflow.md` exists and matches the actual CLI surface.
- Generated emitters include the right marker.
- The recommended loop is documented.

---

# Backlog (post-Phase 3)

- Optional `skills.sh` `contexture-integration` skill that triggers on domain,
  Convex, Zod, JSON Schema, or MCP setup work and points to the workflow doc.

---

# Final target workflow

A coding agent in a downstream app should be able to do:

```bash
contexture inspect --json
contexture add-field User email '{"kind":"string","format":"email"}'
contexture validate
contexture emit
contexture check-generated
bun run typecheck
```

Outcome:

> Domain model first, generated app schemas second, coding agents guided by a stable CLI boundary.
