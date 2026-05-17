# Contexture domain-model workflow

This project uses **Contexture** as the source of truth for its domain model.
The IR lives in `*.contexture.json`; everything else (Convex schema, Zod
schema, JSON Schema, the schema-index barrel) is regenerated from it.

## Rules for agents

- **Do not edit generated schema files.** They carry a
  `@contexture-generated` header and will be overwritten on the next
  regenerate. Files marked `@contexture-seeded` (e.g. table CRUD
  scaffolds, root `AGENTS.md` / `CLAUDE.md`) are seeded once and owned by
  you after that.
- **Treat `*.contexture.json` as the primary domain model.** Add or change
  entities, fields, refs, enums, indexes, and table flags there first.
- **Regenerate after every model change.** Run `contexture emit`.
- **Validate before finishing.** Run `contexture validate` and
  `contexture check-generated` before declaring the task done.

## CLI quick reference

The CLI auto-discovers a single `*.contexture.json` in
`./packages/contexture/` or the current directory. Pass `--ir <path>`
if you need to target a specific file. Add `--json` to any command to
get a machine-readable envelope (`{ ok: true, ... }` or
`{ ok: false, error: { message, code } }`).

### Inspect

```bash
contexture inspect [--json]
contexture list-types [--json]
contexture get-type <name> [--json]
```

### Validate and check for drift

```bash
contexture validate [--json]
contexture check-generated [--json]    # exits 1 if any generated file is stale
```

`check-generated` re-runs the emit pipeline in memory and compares each
output against the file on disk. Wire it into your downstream app's CI
so a missed `contexture emit` fails the build:

```jsonc
// package.json
{
  "scripts": {
    "ci": "tsc --noEmit && vitest run && contexture check-generated"
  }
}
```

### Mutate the model

Pick whichever entrypoint is more convenient. Both validate the result
and re-emit the bundle:

**Per-op subcommands** — typed argv, no JSON quoting hell:

```bash
contexture add-field User email '{"kind":"string","format":"email"}'
contexture update-field User email '{"optional": true}'
contexture delete-field User legacyId
contexture add-type '{"kind":"object","name":"Project","fields":[]}'
contexture set-table-flag Project true
contexture add-index Project byOwner ownerId
```

Full surface in `contexture help`.

**Generic apply** — for callers that already have a serialized `Op`:

```bash
contexture apply --op-json '{"kind":"add_field","typeName":"User","field":{"name":"email","type":{"kind":"string","format":"email"}}}'
contexture apply --op-file ./op.json
```

### Regenerate

```bash
contexture emit [--json]
```

Writes the full bundle (Zod schema, JSON Schema, schema-index barrel,
Convex schema) to the locations resolved by `bundlePathsFor(irPath)`.

### Output Config

The IR may include an optional top-level `outputs` block. When omitted,
Contexture emits the existing bundle exactly as before: Zod, JSON Schema,
schema index, and Convex schema. Existing targets can be disabled explicitly:

```json
{
  "outputs": {
    "jsonSchema": { "enabled": false },
    "convex": { "enabled": false }
  }
}
```

AI-pipeline targets live under `outputs.aiPipeline` and are opt-in:

- `toolSchemas` emits `.contexture/ai-tool-schemas.json`, a provider-neutral
  list of per-type JSON Schema tool definitions.
- `structuredOutputs` emits `.contexture/structured-output-schemas.json`, a
  strict structured-output schema document for SDK adapters.
- `mcpDefinitions` emits `.contexture/mcp-definitions.json`, MCP-style tool
  definitions for downstream servers.
- `formValidators` emits `form-validators.ts`, dependency-free validator
  helpers backed by the generated Zod schemas.

```json
{
  "outputs": {
    "aiPipeline": {
      "toolSchemas": { "enabled": true },
      "structuredOutputs": { "enabled": true },
      "mcpDefinitions": { "enabled": true },
      "formValidators": { "enabled": true }
    }
  }
}
```

## Standard agent loop

```
inspect → mutate → validate → emit → check-generated → app typecheck/tests
```

Concretely:

1. `contexture inspect --json` — orient yourself in the current model.
2. Decide what needs to change.
3. Apply the change via a per-op subcommand or `contexture apply`.
4. `contexture validate` — confirm the IR is still valid.
5. `contexture emit` is implicit on mutations, but run it explicitly if
   you edited the IR JSON by hand.
6. `contexture check-generated` — confirm nothing has drifted.
7. Run the app's own `bun run typecheck` / `bun run test` to confirm
   downstream code still compiles against the regenerated schemas.

## When to edit the JSON directly

Prefer the CLI. Direct edits to `*.contexture.json` are fine for bulk
rewrites or experimental work, but you must:

1. Run `contexture validate` afterwards.
2. Run `contexture emit` to regenerate the bundle.
3. Run `contexture check-generated` to confirm the on-disk artifacts
   match the IR.

## Output contract

- All commands accept `--json` and return either
  `{ ok: true, ... }` or `{ ok: false, error: { message, code } }`.
- Exit code is `0` on success, `1` on any failure (validation, op
  rejection, drift, parse error).
- Human (non-`--json`) output prints terse messages to stdout and
  errors to stderr.
