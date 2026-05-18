---
name: contexture-integration
description: Use Contexture as the source of truth for a TypeScript app's domain model. Use when wiring Contexture IR, generated Zod or JSON Schema, Convex schema, MCP definitions, structured outputs, form validators, or drift checks into an existing repo.
---

# Contexture Integration

Use Contexture as the source of truth for an app's domain model. Your job is to
inspect the target repo, use Contexture CLI or MCP to operate on the IR, wire
generated outputs into the app's existing integration points, and preserve the
contract between the IR and generated files.

## Core Rules

- Treat the `*.contexture.json` IR as the primary domain model.
- Do not edit files with a `@contexture-generated` header.
- Prefer Contexture CLI or MCP operations over hand-editing generated output.
- Configure or use the Contexture MCP server where the agent host supports MCP.
- Wire outputs into the repo that exists; do not assume Next.js, Convex, React,
  Express, or any other framework unless the repo already uses it.
- Report framework-specific uncertainty instead of guessing.

## First Pass

1. Locate the Contexture IR. Search for `*.contexture.json`; if there is more
   than one or none, ask the user which IR to use.
2. Inspect the repo before choosing integration points. Check package scripts,
   existing validation, API boundaries, form handling, schema exports, CI, and
   any existing MCP or agent configuration.
3. Inspect the current Contexture model:

   ```bash
   contexture inspect --json --ir path/to/model.contexture.json
   ```

4. Inspect the IR `outputs` block, if present, so you only wire enabled targets.
5. Identify generated files by their configured output paths and
   `@contexture-generated` headers.

## Safe Contexture Loop

For model changes, use this loop:

```txt
inspect -> apply or edit IR -> validate -> emit -> check-generated -> app checks
```

Commands:

```bash
contexture inspect --json --ir path/to/model.contexture.json
contexture apply --ir path/to/model.contexture.json --op-file ./op.json
contexture validate --ir path/to/model.contexture.json
contexture emit --ir path/to/model.contexture.json
contexture check-generated --ir path/to/model.contexture.json
```

Use typed subcommands such as `add-field`, `update-field`, `delete-field`,
`add-type`, `set-table-flag`, and `add-index` when they are clearer than a
generic `apply` operation. If you edit the IR JSON directly for a bulk rewrite,
run `validate`, `emit`, and `check-generated` before touching app code.

## Wiring Outputs

Wire only the outputs the IR enables and the app can actually consume:

- Zod schemas: connect to existing validation, request parsing, tests, or form
  adapters where the repo already uses Zod or can accept it cleanly.
- JSON Schema: connect to API docs, OpenAPI tooling, validation middleware, or
  downstream tooling where those integration points already exist.
- Convex schema: wire only when the repo already uses Convex.
- Schema index barrels: use existing import/export conventions.
- MCP definitions: configure the Contexture MCP server where supported, or wire
  emitted definitions into an existing MCP server adapter.
- Tool schemas and structured outputs: wire into existing AI provider adapters
  or tool registries without hard-coding provider assumptions.
- Form validators: wire into existing form boundaries without replacing the
  app's form framework unless the user asks for that change.

Keep repo-owned adapter code separate from generated files. If generated output
does not match what the app needs, change the IR or output configuration and
regenerate instead of patching emitted files.

## Package Scripts and CI

Configure package scripts only when appropriate for the target repo. Prefer
adding `contexture validate` and `contexture check-generated` to existing
typecheck, test, or CI flows over creating a new workflow shape from scratch.

Before finishing, run the narrowest useful app checks. For a Bun repo that uses
package scripts, prefer focused commands such as:

```bash
bun run typecheck
bun run test
```

Use the repo's own package manager and scripts when they differ.

## MCP Setup

When the agent host supports MCP, configure the Contexture MCP server as the
safe tool surface over IR inspection, mutation, validation, emit, and drift
checks. Keep MCP setup separate from app wiring:

- MCP provides safe operations over the Contexture model.
- This skill decides where generated outputs belong in the target repo.

If MCP cannot be configured in the current environment, continue with the CLI
and report that limitation.

## Finish Criteria

- The IR remains the source of truth.
- Generated files were regenerated, not manually edited.
- `contexture validate` passed.
- `contexture emit` ran after any direct IR edit.
- `contexture check-generated` passed with no drift.
- App typecheck/tests relevant to the wired outputs passed, or any skipped check
  is reported with the reason.
- The final report lists changed paths, checks run, and any remaining
  framework-specific uncertainty.
