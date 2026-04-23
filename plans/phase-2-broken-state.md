# Phase 2 — intentionally broken state after #79

Issue #79 deletes the OWL / RDF / JSON-LD infrastructure in a single slice.
The desktop app does NOT compile after this commit; subsequent Phase 2 slices
rebuild it IR-first around `model/types.contexture.ts`.

## What is gone

### Dependencies (apps/desktop/package.json)

- `n3`, `@types/n3` — Turtle parser
- `jsonld` — JSON-LD processor
- `@rdfjs/types`, `rdfxml-streaming-parser` — RDF/XML parser

### Source files deleted

**Model layer (apps/desktop/src/renderer/src/model/)**:

- `types.ts` — OWL-centric `Ontology`, `OntologyClass`, `ObjectProperty`,
  `DatatypeProperty`, `Individual`, `Restriction`, `ClassExpression`, etc.
- `parse.ts`, `quads.ts`, `serialize.ts` — RDF parsing / serialization
- `formats/index.ts`, `formats/turtle.ts`, `formats/rdfxml.ts`,
  `formats/jsonld.ts` — format adapters
- `reactflow.ts` — OWL → React Flow node/edge projection

**Store layer (apps/desktop/src/renderer/src/store/)**:

- `ontology.ts` — canonical OWL store (load/save/CRUD over OWL model)
- `ui.ts` — `GraphFilters` (`showSubClassOf`, `showDisjointWith`,
  `showObjectProperties`, `showRestrictions`, …) stripped down; only
  `graphLayout` survives.

**Services (apps/desktop/src/renderer/src/services/)**:

- `validation.ts` — OWL consistency + structural checks
- `metrics.ts` — OWL-specific graph metrics (DIT, disjointness coverage, …)

**Components (apps/desktop/src/renderer/src/components/)**:

- `chat/ChatPanel.tsx`, `chat/useClaude.ts`
- `detail/CharacteristicBadge.tsx`, `detail/ClassDetail.tsx`,
  `detail/DetailPanel.tsx`, `detail/EdgeDetail.tsx`
- `eval/EvalPanel.tsx`
- `graph/ReactFlowCanvas.tsx`
- `graph/nodes/IndividualNode.tsx`
- `graph/edges/DisjointWithEdge.tsx`, `ObjectPropertyEdge.tsx`,
  `RestrictionEdge.tsx`, `SubClassOfEdge.tsx`, `TypeOfEdge.tsx`
- `status-bar/StatusBar.tsx`
- `toolbar/GraphControlsPanel.tsx`

**Main / preload**:

- `main/ipc/claude.ts`, `main/ipc/eval.ts`, `main/ipc/file.ts`
- `preload/index.ts`, `preload/index.d.ts`
- `renderer/src/App.tsx`

**Samples**:

- `resources/sample-ontologies/` (entire dir)
- `renderer/src/samples/people.ttl`

**Tests (apps/desktop/tests/)**:

- `model/` — all OWL/RDF/JSON-LD test files
- `components/` — tests for every deleted component (CharacteristicBadge,
  ChatPanel, ClassDetail, ClassNode, DetailPanel, EdgeDetail, EvalPanel,
  GraphControlsPanel, ObjectPropertyEdge, StatusBar, ValidationPanel)
- `store/` — `ontology.test.ts`, `eval.test.ts`, `history.test.ts`,
  `ui.test.ts`
- `services/` — `validation.test.ts`, `tokens.test.ts`

**E2E (apps/desktop/e2e/)**:

- `file-menu.spec.ts`, `graph-controls.spec.ts`, `import-export.{sh,spec.ts}`,
  `ontology-crud.{sh,spec.ts}`, `search.spec.ts`, `theme-sidebar.spec.ts`

**Docs**:

- `docs/jsonld-test-spec.md`, `docs/jsonld-ui-integration.md`

## What remains

The desktop app is now a scaffold:

- `main/index.ts`, `main/menu.ts`, `main/sentry.ts`,
  `main/syncShellEnvironment.ts`, `main/ipc/update.ts`
- `renderer/index.html`, plus a handful of components that do not depend on
  the model layer (`activity-bar/*`, `toolbar/Toolbar.tsx`,
  `hud/ImprovementHUD.tsx`, `UpdateBanner.tsx`, `validation/*` that survive,
  `ui/*` shadcn primitives, `graph/nodes/ClassNode.tsx`,
  `graph/nodes/GroupNode.tsx`)
- `model/types.contexture.ts` — the IR type contract, ready to be wired up
- `services/tokens.ts` — token estimator, still useful
- `store/ui.ts` — `graphLayout` only
- `hooks/*`, `lib/*`, `components/ui/*` — generic helpers / shadcn

The remaining surface will NOT type-check or build after this commit.
Several components still import deleted modules. That is expected.

## What the next slices rebuild

| Slice | Replaces |
| --- | --- |
| #80 | `model/types.contexture.ts` promoted; Zod meta-schema added |
| #81 | Loader + migrations → new IR store |
| #82 | `services/validation.ts` (7 rules over IR) |
| #83, #84 | Zod + JSON Schema emitters |
| #85 | Ops applier (13 ops) |
| #86 | Transactional undo/redo |
| #87, #88 | Sidecar I/O, atomic save (replaces `ipc/file.ts`) |
| #89, #90, #91 | `packages/stdlib`, `packages/runtime`, bundling |
| #92, #93, #94 | TypeNode, RefEdge, graph interactions, detail panels |
| #95, #96, #97 | System prompt, MCP op tools, turn protocol (replaces `ipc/claude.ts`) |
| #98 | Chat UI (replaces `ChatPanel.tsx`, `useClaude.ts`) |
| #99 | Bundled skills |
| #100 | Eval panel (replaces `EvalPanel.tsx`, `ipc/eval.ts`) |
| #101 | Samples + e2e rewrite |

## Grep verification (the AC)

With word-boundaries applied (to exclude the legitimate `@contexture/*`
package namespace and the vendored `showLineNumbers` identifier in
`apps/web/src/components/ai-elements/code-block.tsx`, which collides on
the `owl` substring), the AC grep returns zero hits:

```sh
grep -rEi '\bowl|\brdf|\bturtle|\bjsonld|@context\b|\bsubclassof|\bdisjointwith|@rdfjs|\brdfxml|\bn3\b' apps/ packages/
```

Without word-boundaries, the raw AC grep pattern picks up only these
false positives:

- `@contexture/desktop`, `@contexture/web`, `@contexture/runtime` —
  our product namespace matches `@context` as a substring.
- `showLineNumbers` — the vendored `ai-elements/code-block.tsx` contains
  this identifier, whose substring contains `owl`.

Both are expected and unrelated to OWL / JSON-LD.
