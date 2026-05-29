# Goal 3: Reconcile As Trust Workflow

## Objective

Make reconcile the workflow where Contexture proves it can protect a source-of-truth model inside a messy real repo.

Reconcile should help users understand and resolve differences between the IR, generated files, and external edits without losing trust.

## Product Promise

When generated Convex files change outside Contexture, review what happened, choose whether the IR or generated files should win, and apply safe model changes when appropriate.

## Why This Matters

Many tools generate code. Contexture becomes more differentiated when it can also answer:

- Did generated code drift from the source model?
- Was this hand-edited, stale, missing, or externally regenerated?
- Can the source model be updated safely from the changed generated file?
- Can an agent edit generated code without silently breaking trust?

This is one of the strongest ways to make Contexture feel like a control plane rather than a codegen utility.

## Scope

- Keep source-model sync separate from generated-target drift.
- Make generated drift understandable and actionable.
- Add Convex-specific reconcile paths for generated schema and validators.
- Propose source IR changes through reviewable Contexture ops.
- Preserve the emitted manifest as the trust anchor for generated artifacts.

## Key Work

### Drift Classification

- Identify generated files that are missing, stale, modified, or externally regenerated.
- Show whether current disk contents match the current IR output.
- Separate generated drift from `.contexture.json` source sync events.
- Keep status language calm and precise.

### Reconcile Review

- Show changed generated files.
- Show a clear generated diff where useful.
- Explain what Contexture believes happened.
- Indicate whether the file is owned by Contexture.
- Make the current source of truth obvious.

### Reconcile Actions

- Re-emit from IR.
- Keep the generated file dirty.
- Open the generated file.
- Check again after external edits.
- Propose IR changes from generated file changes where supported.

### IR Proposal Flow

- Generate candidate ops when Contexture can infer model changes.
- Show proposed ops in readable language.
- Allow accepting or rejecting proposals individually.
- Run structural and semantic validation before applying.
- Show the resulting generated diff before final accept where feasible.
- Keep failed proposals explainable and non-destructive.

### Convex-Specific Reconcile

- Prioritize `convex/schema.ts` and `convex/validators.ts`.
- Use deterministic Convex parsing for supported generated-code edits before asking an LLM to infer changes.
- Detect table, field, and index changes that can map back to the IR.
- Distinguish supported generated-code edits from arbitrary app code.
- Explain when a generated Convex file cannot be reverse-mapped safely.

### Convex CLI Validation

- Treat Convex CLI feedback as downstream validation, not the source of truth.
- After re-emitting or applying supported IR proposals, optionally run a Convex validation/check path when available.
- Surface Convex schema, function, or push errors as project validation feedback after Contexture reconcile decisions are made.
- Do not rely on scraping long-running `convex dev` watcher output as the reconcile authority.
- Do not use private Convex package internals as a stable reverse-mapping API.

### Agent-Aware Reconcile

- Treat agent edits to generated files as normal external drift.
- Prefer source-model ops over hand-editing generated files.
- Give users a clean path from "agent changed generated schema" to "IR updated and drift clean."

## UX Principles

- Reconcile should feel like review, not disaster recovery.
- Use "generated files changed outside Contexture" before stronger words like conflict.
- Never obscure which path makes the IR source of truth.
- Prefer explicit choices over surprising auto-resolution.

## Success Criteria

- A user can understand why generated Convex files are drifted.
- A user can re-emit from IR and return to a clean manifest.
- A user can keep a generated file dirty intentionally.
- For supported generated Convex changes, a user can apply proposed IR ops and return to drift clean.
- When Convex CLI validation is configured, a user can see whether reconciled generated files are accepted by Convex.
- Reconcile makes agent-generated drift reviewable instead of frightening.

## Non-Goals

- Do not attempt to parse or own arbitrary Convex application logic.
- Do not reverse-engineer every possible generated-code edit.
- Do not merge source-model sync and generated-target drift into one ambiguous state.
- Do not auto-apply inferred IR changes without user review.
- Do not replace Contexture's manifest and IR authority with Convex CLI watcher output.

## Dependencies

- Existing emitted manifest and drift watcher.
- Existing op vocabulary and semantic gate.
- Convex generated target stability.
- Model authoring semantics for tables, fields, refs, and indexes.
- Agent oversight surfaces for proposed changes.

## Priority

Very high. This should become a flagship trust workflow after the Convex-first authoring loop is strong enough to dogfood.
