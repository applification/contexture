# Goal 2: Model Authoring Ergonomics

## Objective

Make creating and changing Convex-oriented domain models in Contexture faster, clearer, and safer than editing schema code by hand.

The graph should not only visualize a model. It should be a working authoring surface for real app schemas.

## Product Promise

Sketch and refine your Convex model visually: tables, fields, refs, enums, indexes, and reusable stdlib types, without needing to edit raw IR.

## Why This Matters

Authoring is the daily-use surface. If Contexture is clumsy for basic modeling, generated targets and agent workflows will feel like interesting infrastructure wrapped around a slow editor.

This is the work that turns Contexture from "impressive" into "I want to use this while building."

## Scope

- Improve direct manipulation for creating and editing model elements.
- Make Convex table, field, ref, enum, and index workflows efficient.
- Make stdlib types discoverable.
- Make validation errors explainable and repairable.
- Preserve the closed-world op vocabulary as the mutation path.

## Key Work

### Fast Type Creation

- Add a quick create flow for tables, objects, and enums.
- Focus name input immediately after creation.
- Select and open the new type after creation.
- Use sensible defaults for Convex-oriented models.
- Support keyboard-first creation.

### Fast Field Editing

- Add inline field creation from the detail panel and, where appropriate, from graph nodes.
- Provide a field type picker with primitives, refs, stdlib types, arrays, and optionality.
- Make required, optional, and list settings fast to change.
- Support field descriptions without making the form feel heavy.
- Keep field reordering predictable.

### Ref Ergonomics

- Add searchable target selection for ref fields.
- Show a clear edge preview while selecting refs.
- Support "create referenced type" from the field picker.
- Make rename safety visible through stable refs and clean graph updates.
- Highlight ref-related validation issues in context.

### Convex Table And Index Ergonomics

- Make "table" a clear type-level mode.
- Add an index creation flow from fields.
- Show index summaries in the detail panel.
- Suggest common indexes from refs and likely lookup fields.
- Validate index definitions with plain-language feedback.

### Enum Ergonomics

- Make enum value editing fast.
- Support rename, add, remove, and descriptions.
- Keep enum visibility manageable on the graph.
- Provide clear validation when variants are referenced by discriminated unions.

### Stdlib Discovery

- Add a searchable stdlib picker.
- Group stdlib types by namespace, such as common, contact, identity, money, and place.
- Show descriptions and examples for selected stdlib types.
- Avoid requiring users to memorize qualified names like `place.CountryCode`.

### Error Repair

- Make validation errors clickable.
- Explain errors in product language, not IR language.
- Offer deterministic "apply fix" actions for common issues.
- Keep semantic validation failures visible to both user and agent flows.

## UX Principles

- Every common edit should be possible without raw IR.
- Graph, detail panel, and schema preview should reinforce each other.
- Keyboard and pointer workflows should both feel intentional.
- The user should always know whether they are editing source model state or generated output.

## Success Criteria

- A user can model a small production Convex app without opening raw IR.
- Creating tables, fields, refs, enums, and indexes feels faster than editing generated schema code.
- Validation errors lead users directly to the affected model element.
- Stdlib types are discoverable from the authoring flow.
- Agent-authored changes and user-authored changes go through the same op-backed model path.

## Non-Goals

- Do not build a generic visual programming canvas.
- Do not add arbitrary schema features that cannot be emitted cleanly to Convex.
- Do not bypass the op applier for UI convenience.
- Do not optimize for every possible TypeScript modeling style before Convex workflows are excellent.

## Dependencies

- Convex-first product direction.
- Existing graph canvas, detail panel, undo store, op applier, and semantic validation.
- Generated Convex target behavior.
- Reconcile and agent oversight flows that can reuse clearer model-change semantics.

## Priority

Very high. This is the core day-to-day product surface.
