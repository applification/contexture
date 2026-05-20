# Faithful Domain-Model Control Plane Plan

- **Status:** Proposed
- **Date:** 2026-05-20
- **Related ADRs:** [0022](../adr/0022-contexture-domain-model-control-plane.md), [0023](../adr/0023-features-enter-through-core-domain-modules.md)
- **Related docs:** [Domain-model goals](domain-model-control-plane-goals.md), [Agent workflow](../agent-contexture-workflow.md), [Remove app scaffolder](../remove-app-scaffolder-plan.md)

## Decision Summary

Contexture should become the most trustworthy way to model the domain of a
TypeScript app, then expose that model safely to humans, generated outputs, and
coding agents.

The immediate product arc is:

```txt
faithful model -> semantic workbench -> excellent app outputs -> agent-safe evolution
```

This keeps the direction from ADR 0022 intact: Contexture is still the
domain-model control plane, not an app builder or general agent orchestrator.
The adjustment is emphasis. Recent work on reusable Convex validators and
discriminated-union graph edges shows that the product's leverage depends first
on model fidelity. Agent workflows are compelling only if the underlying model
is expressive, inspectable, and faithfully emitted into real applications.

The product promise should become:

> Contexture is the trusted domain contract for AI-native TypeScript apps:
> design the model once, understand its relationships, emit app-ready surfaces,
> and let agents evolve it through safe operations.

## Why This Shift

The previous roadmap proved the control-plane architecture:

- `.contexture.json` is the canonical IR.
- All mutations route through a closed-world Op vocabulary.
- Core emitters, generated target metadata, bundle paths, and manifest-backed
  drift checks live in `@contexture/core`.
- CLI and MCP expose the same inspect, validate, mutate, emit, and drift-check
  loop to agents.
- The desktop app remains the human visual authoring surface.

The last product improvements sharpen the next layer:

- Convex generation now emits reusable `convex/validators.ts` definitions for
  non-table objects, enums, and discriminated unions.
- `convex/schema.ts` imports those validators instead of inlining partial object
  shapes or falling back to `v.any()` for common app-domain concepts.
- The desktop graph now renders discriminated-union variant edges as semantic
  relationships, not invisible metadata hidden in a detail panel.

Those changes are not merely bug fixes. They show the product becoming a
faithful domain-model workbench for real application shapes. That should be the
next roadmap's center of gravity.

## Product Pillars

### 1. Model Fidelity Comes First

Contexture should accurately represent real TypeScript application domains,
including reusable concepts, nested shapes, discriminated unions, enums,
imports, table references, indexes, raw escape hatches, and target-specific
constraints.

The goal is not to support every possible TypeScript type. The goal is to make
the supported Contexture IR feel deliberate, complete, and dependable. Any loose
fallback should be visible and explainable. Generated `any`-like output should
mean either "the user intentionally chose `raw`" or "semantic validation found a
recoverable in-progress state," not "the emitter forgot how to express this."

Feature direction:

- Add golden tests around real app-domain shapes, not only tiny emitter cases.
- Track where each emitter falls back to weak output such as `v.any()`,
  permissive JSON Schema, or broad TypeScript types.
- Make discriminated unions, enums, literals, nested refs, arrays, optionality,
  nullability, and table refs work consistently across generated targets.
- Preserve target-specific semantics. A table ref in Convex may emit `v.id`,
  while the same relationship in JSON Schema or AI tool schemas may need a
  different representation.
- Treat reusable generated helpers as first-class outputs when they make app
  integration cleaner, as with Convex validators.

Completion evidence:

- A representative fixture corpus covers nested refs, discriminated unions,
  enums, table refs, indexes, raw types, imports, and AI-pipeline outputs.
- Each generated target has tests that prove the same fixture emits faithful
  target-specific output.
- Weak fallbacks are audited, documented in tests, and surfaced in UI or CLI
  output when they affect generated quality.
- Real dogfood apps can remove handwritten schema glue because Contexture emits
  the needed reusable pieces.

### 2. The Desktop App Becomes A Semantic Workbench

The graph is not decorative. It is the user's trust surface for understanding
what the model means before generated files change.

The desktop app should help a user answer:

- What domain concepts exist?
- Which concepts refer to, contain, or specialize which others?
- Which types become tables?
- Which relationships are indexes, refs, imports, or union variants?
- Which generated files are affected by this model choice?
- Where is the model faithful, and where is it using an escape hatch?

Feature direction:

- Render every important semantic relationship in the graph, not only field
  refs. Union variants are the first example; indexes, imports, output
  participation, and table boundaries should become similarly legible.
- Make selection details explain the relationship in domain terms and point to
  the editable source of truth.
- Add output-impact previews: selecting a type or edge should show which
  generated targets consume it.
- Make drift and weak-fallback warnings visible where the user is already
  thinking about the model.
- Keep the UI quiet and operational. The workbench should feel like a precise
  schema instrument, not a marketing canvas.

Completion evidence:

- The graph has tested builders for every relationship type it claims to show.
- Detail panels explain relationship source, target, and edit path without
  introducing fake edge entities.
- Users can inspect the generated-output impact of a type before emitting.
- Drift/reconcile state is visible without forcing the user to leave the model
  context.

### 3. Convex Is The Strategic Beachhead

Convex is currently the clearest proof point for Contexture because it turns the
domain model into application-critical runtime behavior: tables, validators,
IDs, indexes, and function argument validation.

Contexture should not become Convex-only. But the Convex path should become
excellent enough that it proves the broader product thesis:

> If Contexture can faithfully own a Convex app's domain contract, the same IR
> can safely feed Zod, JSON Schema, MCP definitions, structured outputs, and
> agent tooling.

Feature direction:

- Continue tightening Convex schema and validator generation.
- Generate helpers that app code can use directly in queries, mutations,
  actions, and shared validation code.
- Make Convex-specific constraints visible at authoring time, not only during
  emit. Reserved names are one example; table refs, index field validity, and
  unsupported type forms should follow the same pattern.
- Dogfood against multiple real Convex products and feed every sharp edge back
  into fixtures, semantic validation, or generated helpers.
- Keep Convex output opt-out as a core target, but avoid making other emitters
  second-class. Convex is the proving ground, not the boundary of the product.

Completion evidence:

- Real Convex apps can use Contexture-generated validators outside
  `convex/schema.ts`.
- Contexture catches Convex-specific schema problems before generated code hits
  app typecheck.
- Dogfood apps pass `contexture validate`, `contexture emit`,
  `contexture check-generated`, and their own Convex/app tests.
- The marketing and docs can show a concrete Convex workflow without implying
  Contexture only serves Convex users.

### 4. Outputs Become App Integrations, Not Just Files

Generated targets should feel like coherent app integration surfaces. The value
is not "Contexture writes many files"; the value is "Contexture writes the
fragile, boring, domain-derived glue correctly and keeps it in sync."

Feature direction:

- Keep every generated output manifest-backed and drift-checked.
- Provide copyable integration guidance for each enabled output.
- Make AI-pipeline outputs directly consumable by common SDK patterns:
  structured outputs, tool schemas, MCP definitions, and form validators.
- Generate small, reusable helpers where that reduces app glue and preserves
  target fidelity.
- Show output configuration as a product choice: enable only what this app
  actually consumes.

Completion evidence:

- For each generated target, docs answer where it is emitted, who consumes it,
  how to enable it, and how to verify drift.
- Desktop output configuration explains the consequences of enabling or
  disabling a target.
- Agent prompts and MCP setup guidance include the selected output set and the
  correct verification loop.

### 5. Agents Evolve The Model Through The Trust Layer

Agent-safe schema evolution remains the distinctive long-term wedge, but it
should build on model fidelity rather than outrun it.

Agents should not be encouraged to edit generated files or infer the domain by
reading scattered app code. They should inspect the Contexture IR, propose Ops,
apply them through the semantic gate, emit, check drift, and then run app tests.

Feature direction:

- Expand MCP and CLI read tools around explanation, not just mutation:
  `explain_type`, `list_relationships`, `list_outputs`, `summarize_drift`, and
  `explain_generated_target`.
- Add provider-neutral proposal flows that return reviewable Ops plus rationale.
- Make failed Ops teach the agent how to repair the request.
- Keep schema-only mode strict. Provider runtimes are adapters over the
  Contexture Op contract, not general repo-writing agents.
- Let downstream coding agents consume Contexture outputs and guidance, but do
  not make Contexture own application rewrites.

Completion evidence:

- A coding agent can make a non-trivial model change using MCP without direct
  repo write access beyond the Contexture bundle.
- The agent gets useful explanations for validation failures and drift.
- Proposed Ops are reviewable by humans before application in desktop flows.
- The same change path works through desktop chat, CLI, and MCP.

## Sequenced Roadmap

### Phase 1 — Fidelity Audit And Fixture Corpus

Create a shared set of domain fixtures that exercise the real shapes Contexture
wants to own.

Scope:

- Nested reusable objects.
- Local enums and literal unions.
- Discriminated unions with object variants.
- Table objects with refs, arrays, optional fields, nullable fields, and indexes.
- Raw escape hatches.
- Imports and cross-boundary refs.
- Enabled and disabled output targets.

Deliverables:

- A fixture module under the relevant test package.
- Per-emitter tests that use the same fixtures.
- A documented list of intentional weak fallbacks.
- A short "model fidelity" section in contributor docs explaining how new IR
  features must land across emitters, graph, validation, CLI/MCP, and desktop.

### Phase 2 — Complete Semantic Graph Coverage

Make the graph match the domain semantics users need to reason about.

Scope:

- Keep field-ref and union-variant edges tested.
- Add graph treatment for indexes, imports, table boundaries, and generated
  output participation where those relationships help users reason.
- Add detail-panel explanations and edit affordances for each relationship type.
- Ensure invalid or in-progress schemas remain renderable while validation
  reports the issue clearly.

Deliverables:

- Tested graph builder outputs for each semantic relationship.
- Legend and edge styling that remain readable without becoming noisy.
- Detail panels that explain source, target, and edit path.
- Output-impact inspection for selected types.

### Phase 3 — Convex Excellence

Use Convex as the highest-signal integration proving ground.

Scope:

- Keep tightening `convex/schema.ts` and `convex/validators.ts`.
- Add generated helpers for Convex function args where they remove real app
  duplication.
- Promote Convex-specific validation from emitter backstops into semantic
  validation or UI affordances where possible.
- Dogfood against real apps before broadening the pattern.

Deliverables:

- Convex fixture coverage for table refs, reusable validators, discriminated
  unions, indexes, and reserved names.
- Generated validators that app code can import intentionally.
- Dogfood notes with sharp edges converted into tests or backlog items.

### Phase 4 — Integration Guidance And Output UX

Make enabled outputs understandable and easy to wire into existing apps.

Scope:

- Improve generated-output configuration in desktop.
- Add per-output integration guidance for humans and agents.
- Make MCP setup and workflow prompts include the active IR path and enabled
  output set.
- Keep guidance explicit that Contexture owns generated targets, not app code.

Deliverables:

- Desktop copy surfaces for MCP setup, agent workflow, and target-specific
  integration prompts.
- Docs for each output target.
- Tests around generated target metadata so labels, paths, enablement, and
  help text stay coherent.

### Phase 5 — Agent-Safe Evolution

Build richer agent flows on top of the faithful model and output system.

Scope:

- Add read/explain MCP tools before adding more write power.
- Improve Op proposal and error-repair flows.
- Let reconcile proposals become more semantic, but keep generated-file
  overwrite protection strict.
- Consider guided fold-back from edited generated files only after drift
  explanations and model fidelity are strong.

Deliverables:

- MCP tools for type explanation, relationship listing, output listing, and
  drift summarization.
- Provider-neutral proposal flows that return Ops plus rationale.
- Reconcile UI that explains what model concept caused drift before asking the
  user to regenerate or apply Ops.

## Out Of Scope

This plan does not re-open rejected product directions from ADR 0022.

Contexture should not:

- Scaffold or own full application workspaces.
- Become a general coding-agent task runner.
- Manage issues, PRs, missions, or deployment workflows.
- Mutate arbitrary downstream app files as part of the core product.
- Treat generated-file edits as a silent source of truth.
- Reopen JSON-LD, OWL, or ontology tooling without new evidence from real users.

Those adjacent systems can consume Contexture through CLI, MCP, generated
outputs, prompts, and skills. They should not become Contexture's product
surface.

## Product Test

When evaluating a future feature, ask these questions in order:

1. Does it make the Contexture IR more faithful to real app-domain concepts?
2. Does it help humans understand or safely edit that model?
3. Does it improve generated outputs that real apps consume?
4. Does it preserve manifest-backed drift and the closed-world Op contract?
5. Does it help agents operate through Contexture instead of around it?

If the answer starts at question 5 and skips the earlier questions, the feature
is probably premature. If the feature requires Contexture to own application
code, issue flow, deployment, or arbitrary repo mutation, it belongs outside the
core product.

## Near-Term Candidate Slices

These are deliberately vertical slices, not broad refactors.

1. **Model fixture corpus**
   Add shared fixtures for nested reusable objects, enums, discriminated unions,
   table refs, imports, raw types, and enabled outputs. Use them across emitters,
   graph tests, and semantic validation tests.

2. **Weak fallback audit**
   Inventory every generated fallback to `any`-like behavior, classify it as
   intentional or a fidelity gap, and add tests for each classification.

3. **Graph output impact**
   Show which generated targets consume the selected type or relationship.
   Start read-only and derive it from existing generated-target metadata.

4. **Convex function validator helpers**
   Extend Convex output beyond schema tables when dogfood apps prove the helper
   shape. Keep imports explicit and generated files manifest-backed.

5. **MCP explain tools**
   Add read-only tools that let agents ask what a type is, which relationships
   it participates in, which outputs consume it, and why drift exists.

6. **Semantic reconcile explanations**
   Before adding ambitious fold-back, make the reconcile modal explain drift in
   terms of model concepts and generated targets.

## Success Signal

Contexture is winning when a developer or agent reaches for it before touching
domain-shaped app code.

The behavioral signal is:

```txt
I need to change the app's domain.
I will inspect/change the Contexture IR, emit, check drift, then update app code
against the generated contract.
```

The product should make that path feel safer, faster, and more obvious than
editing scattered schemas by hand.
