# MissionPlan JSON schema

The orchestrator validates emitted plans against [`.sandcastle/missions/schema.ts`](../../../.sandcastle/missions/schema.ts) (Zod). This document is the human-readable mirror — keep them in sync.

## Top-level shape

```json
{
  "slug": "convex-ir-2026-05",
  "title": "Bring up Convex emit for the IR",
  "objective": "Generate Convex schemas, mutations, and CRUD seeds from the existing IR fixtures.",
  "milestones": [ /* at least one */ ]
}
```

| Field | Type | Notes |
|---|---|---|
| `slug` | string | lowercase letters, digits, hyphens; unique across all missions |
| `title` | string | human-readable |
| `objective` | string | one or two sentences |
| `milestones` | array | at least one milestone |

## Milestone

```json
{
  "slug": "schema-emit",
  "title": "Schema emit",
  "successCriteria": [
    "Convex schema.ts is emitted for every IR table",
    "bun run typecheck passes in apps/missions"
  ],
  "validationPrompt": "Run bun run ci. Inspect packages/schema/convex/schema.ts and confirm every table from the IR is present.",
  "features": [ /* at least one */ ]
}
```

| Field | Type | Notes |
|---|---|---|
| `slug` | string | unique within the mission |
| `title` | string | human-readable |
| `successCriteria` | array of strings | at least one; concrete and testable |
| `validationPrompt` | string | what the validator agent runs at the milestone gate |
| `features` | array | at least one |

## Feature

```json
{
  "slug": "emit-schema-ts",
  "title": "Emit schema.ts from IR",
  "prompt": "Add an emitter function in packages/core/src/emit-convex/schema.ts that walks the IR and produces convex/schema.ts. Use existing IR types from packages/core/src/ir.ts.",
  "dependencies": [],
  "pathsOwned": ["packages/core/src/emit-convex/**"],
  "preferredAgent": "claude",
  "skillRefs": ["backend"]
}
```

| Field | Type | Notes |
|---|---|---|
| `slug` | string | unique across all features in the mission |
| `title` | string | human-readable |
| `prompt` | string | the instruction the worker agent receives. Be specific. |
| `dependencies` | array of feature slugs | features that must finish before this starts. Defaults to `[]`. |
| `pathsOwned` | array of globs | files/dirs this feature is allowed to modify. Used for conflict detection. Defaults to `[]`. |
| `preferredAgent` | "claude" \| "codex" | defaults to "claude" |
| `skillRefs` | array of strings | references to `.sandcastle/missions/skills/<name>.md`. Defaults to `[]`. |

## Validation

The orchestrator rejects plans where:

- A `slug` doesn't match `/^[a-z0-9][a-z0-9-]*$/`.
- A milestone has zero features, or a mission has zero milestones.
- A feature's `dependencies` reference an unknown feature slug.
- Two features share the same slug.
- Required string fields are empty.

When validation fails, the orchestrator re-prompts you with the validation error. Read it carefully and emit a corrected plan. Do not start over from scratch.
