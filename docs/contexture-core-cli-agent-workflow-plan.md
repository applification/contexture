# Contexture Core + CLI + Agent Workflow Plan

## Goal

Make Contexture the source of truth for downstream app domain models, so coding agents can inspect or change the domain model first, then regenerate Convex, Zod, and JSON Schema artifacts reliably.

Scope: **Phase 1, Phase 2, and Phase 3 only**.

---

# Phase 1 — Extract `@contexture/core`

## Objective

Move all pure domain-model logic out of the Electron renderer so it can be used by:

- Desktop app
- CLI
- future MCP wrapper, if needed
- tests/CI
- generated downstream projects

## Target package

Create:

```txt
packages/core/
  package.json
  tsconfig.json
  src/
    index.ts
    ir.ts
    load.ts
    migrations/
      index.ts
    ops.ts
    validation.ts
    emit-zod.ts
    emit-json-schema.ts
    emit-convex.ts
```

## Move from desktop renderer

Move or refactor these existing modules:

```txt
apps/desktop/src/renderer/src/model/ir.ts
apps/desktop/src/renderer/src/model/load.ts
apps/desktop/src/renderer/src/model/migrations/
apps/desktop/src/renderer/src/model/emit-zod.ts
apps/desktop/src/renderer/src/model/emit-json-schema.ts
apps/desktop/src/renderer/src/model/emit-convex.ts
apps/desktop/src/renderer/src/store/ops.ts
apps/desktop/src/renderer/src/services/validation.ts
```

Into:

```txt
packages/core/src/
```

Rename `store/ops.ts` to something less UI-specific:

```txt
packages/core/src/ops.ts
```

## Public API

`packages/core/src/index.ts` should export:

```ts
export * from './ir'
export * from './load'
export * from './ops'
export * from './validation'
export * from './emit-zod'
export * from './emit-json-schema'
export * from './emit-convex'
```

Intended usage:

```ts
import {
  IRSchema,
  load,
  save,
  apply,
  validate,
  emitZod,
  emitJsonSchema,
  emitConvexSchema,
} from '@contexture/core'
```

## Package config

`packages/core/package.json`:

```json
{
  "name": "@contexture/core",
  "version": "0.14.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "zod": "^4.3.6"
  }
}
```

If `emit-zod` or validation needs stdlib data, avoid importing from desktop. Either keep imports from `@contexture/stdlib`, or make stdlib registry an injected option. Prefer injection where possible:

```ts
validate(schema, { stdlib })
```

## Desktop updates

Change desktop imports from renderer-local modules to core package imports.

Examples:

```ts
// Before
import { emit } from './model/emit-zod'

// After
import { emitZod } from '@contexture/core'
```

```ts
// Before
import type { Op } from '../store/ops'

// After
import type { Op } from '@contexture/core'
```

The desktop `useUndoStore` should remain in desktop, but use core’s pure reducer:

```ts
import { apply as applyOp } from '@contexture/core'
```

## Testing

Move core tests out of desktop where sensible:

```txt
packages/core/src/*.test.ts
```

Core should have tests for:

- IR parsing
- load/save
- migrations
- each op
- validation
- Zod emitter
- JSON Schema emitter
- Convex emitter

## Exit criteria

- `@contexture/core` builds/typechecks.
- Desktop imports core package instead of renderer-local pure modules.
- No Electron, React, Zustand, IPC, or DOM imports in `packages/core`.
- Existing desktop behavior unchanged.
- These pass:

```bash
bun run format:check
bun run lint
bun run test
bun run typecheck
```

---

# Phase 2 — Build `contexture` CLI

## Objective

Create a CLI that coding agents and humans can use to inspect, validate, mutate, and regenerate artifacts from `.contexture.json`.

This becomes the primary automation boundary.

## Target package

Create:

```txt
packages/cli/
  package.json
  tsconfig.json
  src/
    index.ts
    commands/
      inspect.ts
      validate.ts
      apply.ts
      emit.ts
      check-generated.ts
```

Package name:

```json
{
  "name": "@contexture/cli",
  "bin": {
    "contexture": "./src/index.ts"
  }
}
```

For internal use, running through Bun is acceptable initially:

```bash
bun packages/cli/src/index.ts validate domain.contexture.json
```

Later this can become a real executable.

## CLI commands

## 1. `contexture inspect`

Purpose: give agents a machine-readable and human-readable summary.

```bash
contexture inspect ./domain.contexture.json
contexture inspect ./domain.contexture.json --json
```

Human output example:

```txt
Schema: Domain
Types: 5
Objects:
  User
    - name: string
    - email: common.Email
  Project
    - title: string
    - owner: User
Enums:
  ProjectStatus: active, archived
Imports:
  common -> @contexture/common
```

JSON output shape:

```json
{
  "path": "./domain.contexture.json",
  "version": "1",
  "typeCount": 5,
  "types": [
    {
      "name": "User",
      "kind": "object",
      "fields": [
        { "name": "name", "type": "string" },
        { "name": "email", "type": "common.Email" }
      ]
    }
  ],
  "imports": []
}
```

## 2. `contexture validate`

Purpose: validate IR and semantic rules.

```bash
contexture validate ./domain.contexture.json
contexture validate ./domain.contexture.json --json
```

Exit codes:

- `0`: valid
- `1`: invalid

JSON output:

```json
{
  "valid": false,
  "errors": [
    {
      "path": "types[1].fields[0].typeName",
      "message": "Unknown ref UserProfile"
    }
  ]
}
```

## 3. `contexture emit`

Purpose: generate downstream artifacts.

```bash
contexture emit zod ./domain.contexture.json --out ./packages/domain/schema.ts
contexture emit json-schema ./domain.contexture.json --out ./packages/domain/schema.json
contexture emit convex ./domain.contexture.json --out ./apps/web/convex/schema.ts
```

Also support stdout:

```bash
contexture emit zod ./domain.contexture.json
```

Recommended subcommands:

```txt
contexture emit zod
contexture emit json-schema
contexture emit convex
contexture emit all
```

`emit all` can write conventional sidecars next to the IR:

```bash
contexture emit all ./domain.contexture.json
```

For now, keep explicit `--out`.

## 4. `contexture apply`

Purpose: allow agents to apply structured ops safely.

```bash
contexture apply ./domain.contexture.json --op ./op.json
contexture apply ./domain.contexture.json --op-json '{"kind":"add_type",...}'
```

Default behavior:

- load schema
- apply op
- validate result
- save updated `.contexture.json`
- optionally emit artifacts if flags are passed

Example:

```bash
contexture apply domain.contexture.json \
  --op-json '{"kind":"add_field","typeName":"User","field":{"name":"email","type":{"kind":"string","format":"email"}}}'
```

Useful flags:

```bash
--dry-run
--json
--emit zod
--emit json-schema
--emit convex
--emit-all
```

For `--dry-run`, do not write. Print resulting validation state and diff-like summary.

## 5. `contexture check-generated`

Purpose: prevent generated artifacts from drifting.

```bash
contexture check-generated ./domain.contexture.json \
  --zod ./packages/domain/schema.ts \
  --json-schema ./packages/domain/schema.json \
  --convex ./apps/web/convex/schema.ts
```

Behavior:

- regenerate in memory
- compare with files on disk
- exit `0` if in sync
- exit `1` if stale or invalid

Output:

```txt
Generated files are stale:
  apps/web/convex/schema.ts

Run:
  contexture emit convex ./domain.contexture.json --out ./apps/web/convex/schema.ts
```

This is important for agent workflows and CI.

## Minimal argument parsing

For internal use, avoid overengineering.

Options:

- Use a small dependency like `commander`, or
- Implement simple manual parsing.

Manual parsing is fine for Phase 2. Use `commander` only if nicer help output becomes valuable.

## Exit criteria

- CLI can inspect, validate, emit Zod, emit JSON Schema, emit Convex.
- CLI can apply an op and save the IR.
- CLI has JSON output suitable for coding agents.
- CLI has stable non-zero exit codes.
- Desktop and CLI both use `@contexture/core`.
- Basic tests cover commands.
- These pass:

```bash
bun run format:check
bun run lint
bun run test
bun run typecheck
```

---

# Phase 3 — Agent workflow docs / skill

## Objective

Teach coding agents that Contexture is the source of truth.

This phase is not about new runtime capability. It is about making the desired workflow legible and repeatable for Claude Code, Cursor, iClord Code, or another agent editing the downstream app.

## Add reusable agent instructions

Create something like:

```txt
packages/cli/templates/CLAUDE.contexture.md
```

or:

```txt
docs/agent-contexture-workflow.md
```

Recommended content:

````md
# Contexture Domain Model Workflow

This project uses Contexture as the source of truth for domain models.

## Rules

- Do not directly edit generated schema files unless explicitly asked.
- Treat `*.contexture.json` as the primary domain model.
- When changing entities, fields, refs, enums, tables, or indexes, update the Contexture model first.
- After changing the model, regenerate generated artifacts with the Contexture CLI.
- Run validation before finishing.

## Common commands

Inspect the model:

```bash
contexture inspect ./domain.contexture.json
```

Validate:

```bash
contexture validate ./domain.contexture.json
```

Emit Convex schema:

```bash
contexture emit convex ./domain.contexture.json --out ./apps/web/convex/schema.ts
```

Check generated files:

```bash
contexture check-generated ./domain.contexture.json \
  --convex ./apps/web/convex/schema.ts
```

## Agent workflow

1. Locate the `.contexture.json` file.
2. Inspect it using `contexture inspect`.
3. Decide what model change is required.
4. Apply the change to the Contexture model.
5. Validate the model.
6. Regenerate generated artifacts.
7. Run project tests/typecheck.
````

## Optional skill

If using skill-based agents, add a skill:

```txt
.agents/skills/contexture-domain-model/SKILL.md
```

Skill description:

```yaml
---
name: contexture-domain-model
description: Use when making changes to domain entities, fields, Convex schema, Zod schemas, or generated model artifacts in a project that uses Contexture.
---
```

Skill body should say:

- Find `.contexture.json`.
- Never edit generated files first.
- Use `contexture inspect`.
- Use `contexture apply` or direct IR edit if necessary.
- Run `contexture validate`.
- Run `contexture emit convex`.
- Run `contexture check-generated`.
- Then proceed with app code changes.

## Add generated-file headers

Ensure all generated files include clear headers:

```ts
// Generated by Contexture from domain.contexture.json.
// Do not edit directly. Update the Contexture model and regenerate.
```

For Convex:

```ts
// Generated by Contexture from domain.contexture.json.
// Do not edit by hand. Run:
//   contexture emit convex domain.contexture.json --out apps/web/convex/schema.ts
```

## Optional downstream project scaffold

Add a command later, or document manually for now:

```bash
contexture init-agent-docs
```

This could copy the workflow doc into a downstream app’s `CLAUDE.md`.

For Phase 3, a static template is enough.

## Exit criteria

- There is a clear reusable agent workflow doc.
- Generated files tell agents not to edit them directly.
- Downstream projects can include the workflow doc or skill.
- The recommended loop is documented:

```txt
inspect -> modify model -> validate -> emit -> check-generated -> test
```

---

# Recommended sequencing

## PR 1: Core extraction

- Add `packages/core`.
- Move pure modules.
- Update desktop imports.
- Keep behavior unchanged.

## PR 2: CLI

- Add `packages/cli`.
- Implement:
  - `inspect`
  - `validate`
  - `emit zod`
  - `emit json-schema`
  - `emit convex`
  - `apply`
  - `check-generated`

## PR 3: Agent workflow

- Add workflow docs / skill template.
- Strengthen generated headers.
- Add examples to README.

---

# Final target workflow

A coding agent in a downstream app should be able to do:

```bash
contexture inspect domain.contexture.json --json
contexture apply domain.contexture.json --op-json '{"kind":"add_field",...}'
contexture validate domain.contexture.json
contexture emit convex domain.contexture.json --out apps/web/convex/schema.ts
contexture check-generated domain.contexture.json --convex apps/web/convex/schema.ts
bun run typecheck
```

That gives the desired core outcome:

> Domain model first, generated app schemas second, coding agents guided by a stable CLI boundary.
