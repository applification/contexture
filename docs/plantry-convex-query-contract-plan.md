# Plantry Convex Query Contract Dog-Food Plan

## Goal

Use Plantry's recipe-library model to make Contexture more honest about Convex query behavior.

The immediate product lesson is that a generated Convex schema is not the whole query contract. Contexture currently models table fields, refs, and plain Convex indexes, but Plantry needs to distinguish:

- indexed lookup paths that Convex can execute directly
- full-text search paths that need Convex `searchIndex`
- household-bounded scans that are intentionally safe only because the candidate set is small
- alias and enrichment flows that need normalized lookup or merge semantics

## Why This Matters

Plantry is a good stress test because its model looks simple but has realistic query pressure:

- recipe-library search over `Recipe.searchText`
- filters over array-valued fields such as tags, cuisines, meal types, equipment, and dietary suitability
- ingredient and cuisine alias resolution
- pantry-overlap scoring over `ingredientIds`
- enrichment pipelines that can create duplicate entities

Without an explicit query contract, the IR can make these flows look more scalable than they are.

## Working Thesis

Contexture should not try to pretend Convex can index every useful shape. It should instead represent enough query intent to emit what Convex supports, warn when a query is a bounded scan, and suggest denormalized lookup tables when the current model cannot scale.

## Plantry Query Contract

Document these decisions in the Plantry model notes before changing Contexture:

### Full-Text Recipe Search

`Recipe.searchText` is the canonical recipe-library full-text search field.

Current gap:

- Contexture indexes only express `defineTable(...).index(...)`.
- Convex `searchIndex(...)` is not represented in the IR.
- Any `searchIndex` configuration must currently live outside Contexture.

Decision:

- Treat `Recipe.searchText` as a Convex search-index candidate.
- Do not describe it as a normal field index.
- Add Contexture support for search indexes before claiming generated Convex output fully owns Plantry recipe search.

### Household-Bounded Array Filters

Recipe library filters over arrays are intentionally household-bounded:

- `tags`
- `cuisineIds`
- `mealTypes`
- `cookingMethods`
- `equipment`
- `dietarySuitability`

Current behavior:

- Query by household first.
- Apply array filters in memory.

Decision:

- This is acceptable for household recipe libraries.
- This is not acceptable for global search, marketplace search, or cross-household discovery without denormalization.
- Plantry docs and Contexture hints should use "bounded scan" language for this pattern.

### Alias Resolution

Aliases on `Ingredient` and `Cuisine` are array-valued and are not directly queryable by index.

Current risk:

- Resolving "zucchini" to "courgette" requires a scan or separate lookup.
- Enrich-and-cache flows can create duplicate `Ingredient` records.
- There is no explicit `mergedInto` pointer for deduplication.

Decision:

- Add normalized alias lookup tables if alias resolution needs indexed behavior:
  - `IngredientAliasLookup`
  - `CuisineAliasLookup`
- Add merge semantics for canonical entities:
  - `Ingredient.mergedIntoIngredientId`
  - optionally `Cuisine.mergedIntoCuisineId`
- Repointing references remains an app migration concern, but the model should make merge state explicit.

### Pantry-Overlap Scoring

`Recipe.ingredientIds` enables cheap pantry-overlap scoring only after the household-scoped recipe set has been loaded.

Decision:

- Describe this as household-bounded scoring, not an index hit.
- If Plantry later needs large-library ranking, introduce a dedicated lookup or scoring table rather than relying on array matching.

## Contexture Implementation Slices

### Slice 1: Add Query Intent Notes To Plantry's Model

Objective: make the Plantry dog-food model honest before adding new Contexture features.

Changes:

- Add a query-contract section to the Plantry schema notes or PRD.
- Mark each recipe-library flow as one of:
  - indexed lookup
  - search index
  - household-bounded scan
  - normalized lookup table needed
  - app-level migration or merge routine
- Reword pantry-overlap matching as household-bounded scoring.
- Explicitly state that array-valued recipe filters do not scale to global search.

Acceptance criteria:

- A reader can tell which Plantry queries are Convex-indexed and which are bounded scans.
- No Plantry copy implies array-valued filters or alias arrays are index-backed.
- Search-index configuration is called out as currently outside Contexture.

### Slice 2: Extend The IR With Convex Search Indexes

Objective: represent Convex full-text search indexes as first-class model state.

Proposed IR shape:

```ts
interface SearchIndexDef {
  name: string;
  searchField: string;
  filterFields?: string[];
}
```

Add `searchIndexes?: SearchIndexDef[]` to table object types.

Validation:

- only table objects can define search indexes
- `searchField` must reference an existing top-level string field
- `filterFields` must reference existing top-level fields
- no duplicate search-index names per table
- search-index names cannot collide with plain index names on the same table
- array fields are rejected as `searchField`

Emitter behavior:

- emit `.searchIndex("name", { searchField: "field", filterFields: [...] })` in `convex/schema.ts`
- preserve deterministic ordering after table fields and alongside plain indexes
- update generated tests and snapshots

Acceptance criteria:

- `Recipe.searchText` can be modeled and emitted as a Convex search index.
- Generated Convex schema matches Convex's `searchIndex` API shape.
- Invalid search-index definitions fail semantic validation before emit.

### Slice 3: Add Bounded-Scan Modeling Hints

Objective: teach Contexture to identify Plantry-like array filters without calling them invalid.

Changes:

- Add a modeling hint for array-valued fields on Convex tables whose names or descriptions suggest filtering/search.
- Recommended hint language:
  - "This array can be filtered after an indexed owner query, but Convex cannot use a normal index to find matching array elements."
- Detect common bounded-owner fields such as `householdId`, `workspaceId`, `teamId`, `tenantId`, or refs with ownership metadata.
- Suggest denormalized lookup tables when no bounded owner field exists.

Acceptance criteria:

- Plantry recipe arrays generate advisory hints, not blocking errors.
- The hint explains why household scope makes the scan acceptable.
- The hint suggests a lookup table for global or cross-household search.

### Slice 4: Add Alias Lookup And Merge Hints

Objective: make alias arrays and duplicate enrichment risks visible in model review.

Changes:

- Add a modeling hint for table fields named `aliases` when they are arrays of strings.
- If the type also has identity fields such as `name`, `canonicalName`, or `slug`, suggest a lookup table.
- Add a modeling hint for canonical catalog tables without merge state when alias/enrichment language appears in descriptions.

Recommended hint actions:

- create a scoped alias lookup table
- add a nullable `mergedInto<Type>Id` ref
- document the app-level repoint routine

Acceptance criteria:

- `Ingredient.aliases` and `Cuisine.aliases` are called out as scan-based unless backed by lookup tables.
- Duplicate enrichment risk is visible in Contexture hints or model notes.
- The guidance does not imply Contexture can perform app data migrations by itself.

### Slice 5: Add Query Contract Metadata

Objective: represent query decisions that are not emitted directly into Convex schema.

Proposed lightweight metadata:

```ts
interface QueryContract {
  name: string;
  table: string;
  pattern: "indexedLookup" | "searchIndex" | "boundedScan" | "lookupTable" | "appComputed";
  fields: string[];
  boundedBy?: string[];
  notes?: string;
}
```

Open question:

- This could live as first-class IR metadata, table-level annotations, or a separate generated/documentation target.

Recommendation:

- Start with model-level metadata and inspect output before adding UI authoring controls.
- Do not emit app query code from this until the metadata proves useful.

Acceptance criteria:

- Plantry can record "recipe filters are household-bounded scans" in machine-readable form.
- Contexture inspect/MCP output can surface the query contract to agents.
- Generated Convex schema remains limited to actual Convex schema constructs.

### Slice 6: UI Review Only After Semantics Land

Objective: avoid designing chrome before the underlying model is clear.

Potential UI needs:

- display `searchIndex` rows alongside plain indexes in type detail
- show bounded-scan hints near affected fields
- distinguish "indexed", "search indexed", and "bounded scan" in field detail
- show query contract metadata in inspect/review surfaces

Designer collaboration:

- Not needed for the initial plan because this pass is schema and query architecture.
- Bring in `@designer` before implementing UI presentation for search indexes and bounded-scan hints.

Acceptance criteria:

- UI work has a clear semantic model to render.
- Accessibility and copy choices are reviewed before adding new visual states.

## Suggested Priority

1. Document the Plantry query contract.
2. Add Convex `searchIndex` IR support and emitter tests.
3. Add bounded-scan hints for array filters.
4. Add alias lookup and merge hints.
5. Decide whether query contracts become first-class IR metadata.
6. Design UI treatment for search-index and bounded-scan states.

## Non-Goals

- Do not generate Convex query functions from this work.
- Do not claim array fields are indexable through plain Convex indexes.
- Do not build a global recipe search architecture unless Plantry explicitly needs it.
- Do not make bounded scans blocking errors when a clear owner scope bounds the candidate set.
- Do not let Contexture imply it owns app-level data migration or deduplication routines.

## Open Questions

- Where should Plantry's source model notes live: repo docs, Obsidian product docs, or a `.contexture` companion note?
- Should `searchIndexes` be emitted only for Convex, or also appear in generic schema outputs as metadata?
- Should query contracts be global IR metadata or table-local annotations?
- How should ownership relationships influence bounded-scan hint severity?
- Should merge pointers be a general canonical-entity pattern in Contexture, or only a Plantry model choice?
