# Goal 1: Convex-First Offering

## Objective

Make Contexture feel like the best way to design, evolve, and keep trust in the domain model for a Convex app.

Contexture should lead with Convex for now. TypeScript, Zod, JSON Schema, structured outputs, MCP definitions, and form validators remain useful supporting outputs, but the product story should be anchored on Convex app builders.

## Product Promise

Design your Convex domain model visually, generate Convex schema and validators, and let agents evolve the model safely through reviewable operations.

## Why This Matters

Convex gives Contexture a concrete wedge:

- Convex apps have an explicit schema surface.
- Builders often move quickly and need to reshape data models often.
- Agent-assisted development is a natural fit for Convex's full-stack app workflow.
- Generated schema and validators create a clear trust boundary.
- A Convex-specific product is easier to understand than a generic TypeScript modeling tool.

## Scope

- Make Convex the default product lens in app surfaces, docs, and marketing.
- Promote table modeling, refs, indexes, schema generation, and validators.
- Treat non-Convex outputs as secondary artifacts.
- Add Convex-specific validation, modeling hints, and review flows where useful.
- Preserve the general Contexture IR architecture so broader TypeScript support can remain available later.

## Key Work

### Product Positioning

- Update product copy to say "for Convex apps" clearly.
- Reframe generated outputs around `convex/schema.ts` and `convex/validators.ts`.
- Keep Zod, JSON Schema, and AI outputs visible as supporting contracts, not the primary pitch.
- Make the website hero, feature order, and examples Convex-first.

### App Surface

- Make Convex outputs first-class in the schema/output panel.
- Show where generated Convex files will be written.
- Explain which model types become Convex tables.
- Show a concise table/index summary for Convex-mode models.
- Add Convex-specific empty states and sample data.

### Modeling Semantics

- Strengthen support for table types.
- Improve refs as a first-class relationship concept.
- Make indexes easy to define, inspect, and review.
- Add Convex-specific warnings for unsupported or risky modeling patterns.
- Add hints for common Convex modeling choices, such as lookup indexes and ref fields.

### Generated Targets

- Treat `convex/schema.ts` and `convex/validators.ts` as primary generated targets.
- Keep emission deterministic and reviewable.
- Ensure generated Convex output stays clean under drift checks.
- Make emitted file paths obvious before generation.

## UX Principles

- A Convex developer should understand the product in seconds.
- Convex concepts should appear in user-facing language.
- Contexture should not pretend to own application code beyond generated artifacts.
- The UI should keep the source of truth obvious: the IR owns the model; Convex files are generated from it.

## Success Criteria

- A Convex developer can explain Contexture's value after viewing the homepage or opening the app.
- A user can create a small Convex domain model with tables, refs, fields, and indexes.
- The user can emit Convex schema and validators and see drift clean.
- The app makes it clear which generated files are owned by Contexture.
- The product no longer feels like a generic schema editor with Convex as one output.

## Non-Goals

- Do not remove TypeScript or AI-oriented outputs.
- Do not make Contexture mutate arbitrary Convex app code.
- Do not build a full Convex project generator before the modeling loop is excellent.
- Do not let onboarding work displace the core Convex modeling experience.

## Dependencies

- Existing generated Convex targets.
- Existing IR, op applier, semantic validation, and drift manifest.
- Model authoring improvements for fields, refs, tables, and indexes.
- Reconcile improvements for generated Convex drift.

## Priority

Highest. This goal sharpens the whole product and should guide the next product decisions.
