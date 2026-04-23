# Contexture Pivot — Implementation Plan (v2, Zod-first)

Supersedes `plans/pivot.md` (JSON-LD direction). Consolidates locked decisions from both grilling sessions — Q1–Q13 (plan.md) and Q14–Q26 (this document's prequel).

---

## Headline

**Contexture is a visual Zod schema editor with LLM support.** Prisma-shaped: IR (`.contexture.json`) is source of truth; Zod (`.schema.ts`) is generated output alongside JSON Schema. Closed-world schema + validation tool for building LLM-ingestion schemas for Dave's products. No JSON-LD, no OWL, no RDF.

User loop: chat to an LLM about a domain → LLM builds a Zod schema via tool-call ops → graph animates per op → schema drives LLM structured output for downstream products.

---

## Locked decisions index

Condensed. Full rationale in `plan.md` (Q1–Q13) and the grill session that produced Q14–Q26.

### Core model
- **Zod-first.** Drop all JSON-LD / OWL / RDF / Turtle / jsonld-lib infrastructure.
- **IR file is source of truth.** `.contexture.json` edited in app; `.schema.ts` + `.schema.json` generated alongside, git-checked, imported by products.
- **IR shape (v1):** pragmatic subset. `TypeDef` variants: `object | enum | discriminatedUnion | raw`. `FieldType` variants: `string | number | boolean | date | literal | ref | array` (8 kinds). `raw` variant is the escape hatch; round-trips losslessly; supports optional `import?: { from, name }` hint for stdlib refs.
- **Addressing by name.** Ops target types and fields by name; no synthetic IDs. IR is small enough (~50KB) that Claude always sees unambiguous names.

### Chat + LLM layer
- **~10 mutation ops** expose Claude's edit surface: `add_type`, `update_type`, `rename_type`, `delete_type`, `add_field`, `update_field`, `delete_field`, `reorder_fields`, `add_variant`, `set_discriminator`, `add_import`, `remove_import`, plus `replace_schema` escape hatch.
- **Hybrid op-schema strictness.** Field-level ops: strict Zod. Type-level ops: lenient `payload: z.unknown()` validated app-side against the IR meta-schema. `replace_schema`: full IR meta-schema.
- **Ops authored via Agent SDK `tool()`** with Zod `inputSchema`. Exposed through an in-process MCP server (`createSdkMcpServer`). One Zod IR meta-schema is the single source of truth for ops, file-load validation, and replace.
- **Streaming apply, turn-level undo.** Per-op animation; per-turn undo entry for chat actions; per-action undo for direct manipulation. Undo store wraps chat turns in transactions.
- **`replace_schema` validation.** Structural pre-flight (reject if IR doesn't parse); semantic errors (dangling refs etc.) flow through the normal validation panel.
- **IR-in-system-prompt.** Full IR included every chat turn (no `describe_*` read tools). Guardrail: if schema exceeds ~100KB, v2 adds summarised digest — not needed v1.

### Execution wiring
- **IR lives in renderer's Zustand store.** MCP handler in main forwards each op to renderer via IPC; renderer applies via the shared mutation surface used by direct manipulation; handler awaits and returns to SDK.
- **Turn-start IR transfer.** Main requests current IR from renderer at turn start to build the system prompt. One IPC send per turn.

### Graph UX
- **Types + fields on canvas; primitives inline on field row.** One node per `TypeDef`, fields as selectable sub-rows, edges from field-level handles.
- **Hybrid interaction.** Structure edits on canvas (drag, double-click, field-handle drag to create ref, context menu, keys). Properties in detail panel. Bulk/generative via chat. All three paths map to the same op vocabulary.
- **ELK auto-layout on load; positions persist in sidecar.**
- **GroupNode kept** for visual grouping (pure UX).

### Skills
- **Claude Code skill format via Agent SDK's native skill system.** `.md` files with YAML frontmatter. SDK handles loading, description-based triggering, and `Skill` tool invocation. No bespoke skill runtime.
- **v1 skills (3):** `model-domain` (checklist + worked examples), `use-stdlib` (pattern nudges), `generate-sample` (mode argument: realistic | minimal | edge-case | adversarial).
- **User-authored skills deferred to v2.**

### Stdlib
- **`packages/stdlib` (internal, not published).** Hand-written Zod per namespace + hand-written IR sidecars. Parity enforced by semantic-equivalence test.
- **`packages/runtime` (published as `@contexture/runtime`).** Re-export stubs over `packages/stdlib`. Version lock-stepped with app.
- **App reads IR from `packages/stdlib` bundled as resources.** App does NOT depend on runtime — runtime is for user-generated code only.
- **19 types across 5 namespaces** (see §Stdlib spec below).

### Emitters
- **v1: Zod + JSON Schema only.** Pydantic / OpenAPI deferred to v2.
- **Generated code imports stdlib from `@contexture/runtime`.** User-to-user cross-project imports emit relative path imports (`import { Address } from '../shared/common.schema'`). Uniform import mechanism.
- **Per-namespace sub-paths** for tree-shaking: `@contexture/runtime/common`, `/identity`, `/place`, `/money`, `/contact`.

### File artifacts (per project)

| File | Purpose | Git | Hand-edit |
|---|---|---|---|
| `<name>.contexture.json` | IR source of truth | yes | discouraged |
| `<name>.contexture.layout.json` | positions, groups, viewport | user choice | no |
| `<name>.contexture.chat.json` | chat history | user choice | no |
| `<name>.schema.ts` | generated Zod | yes | no (regenerated) |
| `<name>.schema.json` | generated JSON Schema | yes | no (regenerated) |
| `<name>.fixtures/*.json` | Eval-saved sample data | user choice | yes |

### Migrations
- **IR has migration chain.** Each version bump ships a migration step.
- **Layout + chat sidecars are disposable.** `version: '1'` tombstone for future-proofing. Unrecognised version → discard + warning, not failure.
- **Rename is atomic** within the IR: `rename_type` updates type and all refs in one op.

### Eval
- **v1 scope:** schema realism check (NL + optional grounding → JSON via `emit_sample` tool whose input schema = the selected root type's JSON Schema) + save-as-fixture.
- **v1 NOT in scope:** extraction quality harness, golden sets, multi-trial, diff-vs-expected, mid-generation streaming.
- **Eval panel UI:** prompt box, grounding text, root-type dropdown, mode dropdown (driven by `generate-sample` skill), Generate / Regenerate / Save as fixture / Copy JSON actions. Post-generation Zod validation with green check or field-level errors.
- **Fixtures colocated:** `<schema>.fixtures/<timestamp>-<name>.json`.
- **Eval history NOT persisted v1.**
- **Separate chat + Eval surfaces** (different histories, prompts, tool sets; switching is explicit UI).

---

## IR shape (v1)

```ts
type Schema = {
  version: '1'
  types: TypeDef[]
  imports?: ImportDecl[]
  metadata?: { name?: string; description?: string }
}

type ImportDecl =
  | { kind: 'stdlib'; path: `@contexture/${string}`; alias: string }
  | { kind: 'relative'; path: string; alias: string }

type TypeDef =
  | { kind: 'object'; name: string; description?: string; fields: FieldDef[] }
  | { kind: 'enum'; name: string; description?: string; values: Array<{ value: string; description?: string }> }
  | { kind: 'discriminatedUnion'; name: string; description?: string; discriminator: string; variants: string[] }
  | { kind: 'raw'; name: string; description?: string; zod: string; jsonSchema: object; import?: { from: string; name: string } }

type FieldDef = {
  name: string
  description?: string
  type: FieldType
  optional?: boolean
  nullable?: boolean
  default?: unknown
}

type FieldType =
  | { kind: 'string'; min?: number; max?: number; regex?: string; format?: 'email' | 'url' | 'uuid' | 'datetime' }
  | { kind: 'number'; min?: number; max?: number; int?: boolean }
  | { kind: 'boolean' }
  | { kind: 'date' }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'ref'; typeName: string }
  | { kind: 'array'; element: FieldType; min?: number; max?: number }
```

Refs to stdlib/imported types use qualified names: `{ kind: 'ref', typeName: 'common.Email' }` where `common` matches an import alias. Cycles forbidden across imports; loader detects and errors with path.

---

## Stdlib spec (19 types)

### `common` (9)
| Type | Zod form |
|---|---|
| `Email` | `z.string().email()` |
| `URL` | `z.string().url()` |
| `UUID` | `z.string().uuid()` (any version) |
| `ISODate` | `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` |
| `ISODateTime` | `z.string().datetime({ offset: true })` |
| `Slug` | `z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)` |
| `NonEmptyString` | `z.string().min(1)` |
| `PositiveInt` | `z.number().int().positive()` (excludes 0) |
| `PositiveNumber` | `z.number().positive()` |

### `identity` (3)
| Type | Zod form |
|---|---|
| `PersonName` | `z.object({ given: z.string(), family: z.string(), middle: z.string().optional(), suffix: z.string().optional() })` |
| `Pronouns` | `z.string()` (free-form, no constraint) |
| `Handle` | `z.string().regex(/^[a-zA-Z0-9_]{1,30}$/)` |

### `place` (4)
| Type | Zod form |
|---|---|
| `Address` | `z.object({ line1, line2?, locality, region?, postalCode?, countryCode: CountryCode })` |
| `LatLng` | `z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })` |
| `CountryCode` | `z.enum([...249 ISO 3166-1 alpha-2 codes])` |
| `TimeZoneId` | `z.string()` (unconstrained; IANA zones drift) |

### `money` (2)
| Type | Zod form |
|---|---|
| `Money` | `z.object({ amount: z.string(), currencyCode: CurrencyCode })` (amount as string — decimal-safe) |
| `CurrencyCode` | `z.enum([...~180 ISO 4217 codes])` |

### `contact` (1)
| Type | Zod form |
|---|---|
| `PhoneE164` | `z.string().regex(/^\+[1-9]\d{1,14}$/)` |

Deliberate exclusions: `Duration` (ambiguous), `IBAN`/`VAT` (user-owned), `contact.EmailAddress` alias (reference `common.Email` directly).

---

## Op catalogue

Authored via Agent SDK `tool()` with Zod `inputSchema`; exposed as an in-process MCP server. Strict field-level schemas; lenient `payload: z.unknown()` for type-level ops (app-validated against `TypeDefSchema`).

| Op | Strictness | Inputs (sketch) |
|---|---|---|
| `add_type` | lenient | `{ name, kind, payload }` |
| `update_type` | lenient | `{ name, patch }` |
| `rename_type` | strict | `{ from, to }` — cascades refs atomically |
| `delete_type` | strict | `{ name }` |
| `add_field` | strict | `{ typeName, field: FieldDef }` |
| `update_field` | strict | `{ typeName, fieldName, patch: Partial<FieldDef> }` |
| `delete_field` | strict | `{ typeName, fieldName }` |
| `reorder_fields` | strict | `{ typeName, order: string[] }` |
| `add_variant` | strict | `{ unionName, variantTypeName }` |
| `set_discriminator` | strict | `{ unionName, discriminator }` |
| `add_import` | strict | `{ path, alias }` |
| `remove_import` | strict | `{ alias }` |
| `replace_schema` | full IR | `{ schema: Schema }` (Zod meta-schema) |

Each turn: handlers accumulate into a transaction; on turn end, transaction pushes as one undo entry. Mid-turn failure: partial state stays; Claude sees tool-result error and continues or rolls back by emitting compensating ops.

---

## Skill authoring

Files at `apps/desktop/resources/skills/*.md`. Bundled as Agent SDK plugin.

### `model-domain.md`
Frontmatter: `name: model-domain`, `description: Use when the user asks to model or design a schema for a new domain from scratch.` Body: checklist (entities → relationships → enums → constraints → stdlib opportunities), worked examples (allotment, inventory, booking, CRM), house-style rules (prefer discriminated unions over boolean flags; prefer stdlib over bespoke; enum values lowercase-kebab).

### `use-stdlib.md`
Frontmatter: `name: use-stdlib`, `description: Use when a field or pattern in the schema matches a stdlib type (email, address, money, phone, etc.).` Body: pattern → stdlib mapping table. Short.

### `generate-sample.md`
Frontmatter: `name: generate-sample`, `description: Use when generating sample data for a schema in the Eval panel.`, `argument-hint: <mode>` where mode ∈ `realistic | minimal | edge-case | adversarial`. Body branches on argument; each sub-body shapes Claude's generation style.

---

## Scope changes vs legacy `plans/pivot.md`

The JSON-LD pivot is fully superseded:

- **Delete all JSON-LD infrastructure**: jsonld lib, `@context`, framing, IRIs, expand/compact. Even deeper removal than legacy plan.
- **IR file replaces `.jsonld` project file.** Different format, different mental model.
- **Graph semantics change**: types+fields, not `@type` projections.
- **Validation rewrite**: IR Zod meta-schema + referential integrity + Zod codegen compile.
- **Eval repurposed**: schema realism + fixture authoring, not JSON-LD extraction.
- **Added**: cross-project imports, bundled stdlib, `@contexture/runtime` npm package.
- **Added**: three-sidecar project model (IR + layout + chat).
- **Added**: skills via Agent SDK, bundled as plugin.
- **Added**: in-process MCP server for ops; SDK `tool()` for op authoring.

Phase 0 (wordmark) and Phase 1 (rename + repo move) from legacy plan still apply unchanged. Phase 2 becomes the Zod-first core rebuild below.

---

## Phase plan

### Phase 0 — Wordmark + type contract (≈2 days) *(unchanged from legacy)*
- Wordmark swap across marketing-site, brand, app title, icons.
- Decide telemetry + update-channel strategy (fresh Sentry/PostHog, fresh update feed, no auto-upgrade from v0.14).
- Commit a `model/types.contexture.ts` draft (IR shape) for Phase 2 to promote.

**Exit:** wordmark PR merged; IR type file committed but unused.

### Phase 1 — Rename + repo move (1 week) *(unchanged from legacy)*
- `@ontograph/*` → `@contexture/*` across workspaces.
- `appId`, `productName`, menu labels, icon filenames, localStorage keys.
- GitHub repo `DaveHudson/Ontograph` → `applification/contexture`.
- README / DESIGN / site copy rewrite.
- No public release; version stays at v0.14.x.

**Exit:** `grep -ri ontograph` returns zero hits outside CHANGELOG/git history. CI green.

### Phase 2 — Hard delete + Zod core (4–5 weeks)

#### 2a. Delete
All JSON-LD and OWL artefacts. (OWL deletes per legacy plan still apply if not yet removed; add JSON-LD deletes on top: any `jsonld` lib use, `@context` types, `ExpandedDoc` types, JSON-LD validators.) Drop deps: `n3`, `@rdfjs/types`, `rdfxml-streaming-parser`, `jsonld`. Retain `zod`, `@xyflow/react`, `elkjs`, `zustand`, `@anthropic-ai/claude-agent-sdk`.

#### 2b. IR core
- Promote `types.contexture.ts` → `model/types.ts` (IR types as specified above).
- Write IR Zod meta-schema (`model/ir-schema.ts`). Single source of truth.
- Write IR loader (`model/load.ts`): parse, run migrations, validate via meta-schema.
- Write IR migrations infrastructure (`model/migrations/`). v1 has version `'1'`, no prior migrations.
- Delete `store/ontology.ts`; write `store/contexture.ts` (Zustand, no undo middleware from legacy — use new transaction-aware undo store from Phase 2e).

#### 2c. Sidecar files
- Layout sidecar (`model/layout.ts`): load/save `{ version: '1', positions, groups, viewport? }`. Keyed by type name; rename updates lockstep.
- Chat sidecar (`model/chat-history.ts`): load/save `<name>.contexture.chat.json`. Gitignorable. Settings toggle to disable persistence.
- Save = atomic write of IR + layout + chat + generated `.schema.ts` + generated `.schema.json`.

#### 2d. Emitters
- `model/emit-zod.ts` — IR → Zod TS source (~200 LoC). Generates imports from `@contexture/runtime` for stdlib refs and relative `.schema` imports for user-to-user imports.
- `model/emit-json-schema.ts` — IR → JSON Schema (~200 LoC).
- Emitted files carry header: `// Generated by Contexture from <file>. Do not edit.`

#### 2e. Undo store
Transaction-aware: `begin()` / `commit()` / `rollback()`. Direct-manipulation actions push single-op entries. Chat turns wrap all their ops in one `begin`/`commit` pair. Hotkeys + menu wired up.

#### 2f. Validation
New `services/validation.ts` validators:
1. IR parses against Zod meta-schema (structural).
2. Every `ref.typeName` resolves (local type, stdlib, or imported alias).
3. No duplicate type names within a file.
4. Discriminated unions: discriminator field exists on every variant; every variant is an `object` type.
5. Enums: values non-empty, no duplicates.
6. Imports: every alias unique; cycles forbidden.
7. Emitted Zod compiles (sandboxed worker eval).

#### 2g. Graph UX
- `nodes/FrameNode.tsx` → `nodes/TypeNode.tsx` (per IR `TypeDef`). Fields render as selectable sub-rows; primitives shown inline.
- `GroupNode.tsx` kept.
- New edges: `edges/RefEdge.tsx` (field → referenced type). No subClass / disjoint / etc.
- `ReactFlowCanvas.tsx` rewired: ELK layout on load, position persistence, field-handle drag to create ref, keyboard handlers, context menu → ops.
- `GraphLegend.tsx` new labels.
- Imported types render with dashed border / muted fill; cross-boundary edges visually distinct.

#### 2h. Detail panel
- `TypeDetail.tsx` routes on `TypeDef.kind` — object / enum / discriminatedUnion / raw forms.
- `FieldDetail.tsx` routes on `FieldType.kind` — 8 forms.
- `EdgeDetail.tsx` shows ref metadata.
- All edits dispatch ops via shared mutation surface.

#### 2i. Ops + MCP server
- `main/ipc/claude.ts` — rewrite. Holds Agent SDK session; MCP server registered via `createSdkMcpServer`.
- `main/ops/` — one file per op, each exporting an SDK `tool()` call. Handlers forward to renderer via IPC; await result; return to SDK.
- Renderer `store/ops.ts` — shared op-applier used by chat ops (IPC-triggered) and direct-manipulation actions.
- Turn boundary protocol: main sends `turn:begin` before dispatching tool calls; renderer opens undo transaction. Main sends `turn:commit` after SDK turn completes; renderer closes transaction.
- Renderer sends current IR to main at turn start (one IPC send) for system prompt assembly.

#### 2j. Chat UI
- `components/chat/useClaudeSchemaChat.ts` — wraps SDK session with schema-editing system prompt (per plan.md Q13 template).
- System prompt assembly: static header + op vocabulary + enumerated stdlib types + current IR JSON (truncate-and-digest guard at 100KB, not needed v1).
- Chat history persisted in chat sidecar.

#### 2k. Eval UI
- `components/eval/EvalPanel.tsx` — prompt box, grounding text, root-type dropdown (non-imported `TypeDef`s), mode dropdown (`realistic | minimal | edge-case | adversarial`).
- `components/chat/useClaudeEval.ts` — wraps SDK with eval system prompt + `emit_sample` tool whose `inputSchema` is the selected root type's JSON Schema (derived from IR at panel-open time).
- Generate streams JSON; post-generation Zod validation (green check / field-level errors); actions: Regenerate, Save as fixture, Copy JSON.
- Fixtures write to `<schema>.fixtures/<timestamp>-<name>.json`.

#### 2l. Skills
- `apps/desktop/resources/skills/model-domain.md`, `use-stdlib.md`, `generate-sample.md`.
- Agent SDK session configured with skills directory; SDK handles the rest.
- Bundled via Electron's `extraResources` in `electron-builder.yml`.

#### 2m. Stdlib packages
- `packages/stdlib/` — private. Hand-written Zod per namespace (`src/common.ts` etc.) + hand-written IR sidecar (`src/common.contexture.json`). Tests: parity test per namespace; emitter round-trip test.
- `packages/runtime/` — public. Re-export stubs per namespace. `package.json` `"name": "@contexture/runtime"`, version lock-stepped.
- App bundles stdlib IR files via Electron resources.
- Publish `@contexture/runtime` during Phase 3 release.

#### 2n. Tests
- Vitest: `tests/model/ir-schema.test.ts`, `tests/model/emit-zod.test.ts`, `tests/model/emit-json-schema.test.ts`, `tests/model/migrations.test.ts`, `tests/model/validation.test.ts`, `tests/store/ops.test.ts` (every op round-trips), `tests/store/undo-transactions.test.ts`, `tests/components/TypeNode.test.tsx`, `tests/components/TypeDetail.test.tsx`.
- Playwright: rewrite `import-export.spec.ts` against `.contexture.json` only; `contexture-crud.spec.ts` (add type → add field → save → reload → assert); new `chat-ops.spec.ts` (chat turn → op animation → undo restores prior state).

**Exit of Phase 2:** `grep -rEi "owl|rdf|turtle|jsonld|@context|subclassof|disjointwith|@rdfjs|rdfxml|n3" apps/ packages/` zero hits in source. Editor opens `samples/allotment.contexture.json`, user chats "add a Plot type with a name and location," graph animates per op, saves cleanly, round-trips. Stdlib parity tests green. Runtime package builds.

### Phase 3 — Polish + v1 release (2 weeks)
1. Harden chat streaming (cancel, retry, error recovery).
2. Harden Eval loop (streaming output, cancel, validation surfacing).
3. Skill prompt tuning: run realistic sessions, refine `model-domain` house-style rules and worked examples.
4. Telemetry + update-channel work per Phase 0 decision.
5. Marketing site copy final pass.
6. Publish `@contexture/runtime` to npm at same version as app.
7. Bump to `v1.0.0`. Tag. GitHub Actions builds/publishes signed installers. Release notes: Zod-first visual editor, LLM-assisted schema design, stdlib, Eval.

**Exit:** public v1.0.0 Contexture build downloadable; `@contexture/runtime@1.0.0` on npm; `/download` page live; CI green.

### Phase 4 — Deferred (post-v1)
- User-authored skills
- Pydantic / OpenAPI emitters
- Refactor skills (`extract-discriminated-union`, `normalise-to-ref`, `split-type`, `merge-types`)
- Import existing Zod → IR (LLM-assisted)
- Multi-project workspace mode
- Large-IR digest + read-on-demand tools (>100KB schemas)
- Extraction-quality eval harness (golden sets, rubric scoring)
- Kosmos integration

---

## Critical files

### Delete (if not already gone from legacy Phase 2)
- `model/parse.ts`, `quads.ts`, `serialize.ts`, `formats/turtle.ts`, `formats/rdfxml.ts`, `formats/jsonld.ts`
- All OWL edge components, `CharacteristicBadge.tsx`, `IndividualNode.tsx`
- Any `@context` / JSON-LD helper modules introduced in a partial legacy Phase 2
- `samples/*.ttl`, `samples/*.jsonld`
- Legacy OWL + JSON-LD test files

### New
- `packages/stdlib/` (9 Zod files + 9 IR files + parity tests)
- `packages/runtime/` (re-export stubs)
- `apps/desktop/resources/skills/*.md` (3 skill files)
- `apps/desktop/src/renderer/src/model/types.ts` (IR types)
- `apps/desktop/src/renderer/src/model/ir-schema.ts` (IR Zod meta-schema)
- `apps/desktop/src/renderer/src/model/migrations/` (migration chain)
- `apps/desktop/src/renderer/src/model/emit-zod.ts`
- `apps/desktop/src/renderer/src/model/emit-json-schema.ts`
- `apps/desktop/src/renderer/src/model/layout.ts`
- `apps/desktop/src/renderer/src/model/chat-history.ts`
- `apps/desktop/src/renderer/src/store/contexture.ts`
- `apps/desktop/src/renderer/src/store/ops.ts`
- `apps/desktop/src/renderer/src/store/undo.ts` (transaction-aware)
- `apps/desktop/src/main/ops/*.ts` (one per op)
- `apps/desktop/src/renderer/src/components/graph/nodes/TypeNode.tsx`
- `apps/desktop/src/renderer/src/components/graph/edges/RefEdge.tsx`
- `apps/desktop/src/renderer/src/components/detail/TypeDetail.tsx`
- `apps/desktop/src/renderer/src/components/detail/FieldDetail.tsx`
- `apps/desktop/src/renderer/src/components/chat/useClaudeSchemaChat.ts`
- `apps/desktop/src/renderer/src/components/chat/useClaudeEval.ts`
- `apps/desktop/src/renderer/src/samples/allotment.contexture.json`

### Rewrite
- `main/ipc/claude.ts` — Agent SDK session + MCP server
- `main/ipc/file.ts` — filter to `.contexture.json`
- `main/menu.ts` — labels, open filter
- `services/validation.ts` — 7 validators above
- `components/graph/ReactFlowCanvas.tsx` — types/fields/ref edges
- `components/graph/GraphLegend.tsx`
- `components/detail/DetailPanel.tsx`
- `components/detail/EdgeDetail.tsx`
- `components/validation/ValidationPanel.tsx`
- `components/eval/EvalPanel.tsx`
- `App.tsx`

---

## Verification

- `bun run format:check && bun run lint && bun run test && bun run typecheck` green after Phase 2.
- `bun run e2e` passes.
- Stdlib parity tests: hand-written Zod ⇔ IR-emitted Zod semantic equivalence on fixture inputs.
- `grep -rEi "owl|rdf|turtle|jsonld|@rdfjs|rdfxml|n3|ontograph" apps/ packages/` zero hits in source (CHANGELOG / node_modules allowed).
- Manual: `bun run dev`, open `samples/allotment.contexture.json`, chat "add a Harvest type with a date and quantity," watch graph animate, save, reopen — state round-trips.
- Manual: double-click `.contexture.json` in Finder from signed build — opens in Contexture.
- Manual: create a new schema using a stdlib type (`common.Email`), save, inspect generated `.schema.ts` for the `import { Email } from '@contexture/runtime/common'` statement.
- Eval: select root type, pick `realistic` mode, generate, confirm output parses via Zod, save as fixture.

---

## Open items (none material to v1 scope)

- Decide file-open UX when user opens a `.schema.ts` or `.schema.json` (error with "open the IR instead"? offer to LLM-convert? v2 problem.)
- Telemetry / PostHog event schema for op-level analytics.
- Empty-state UX for a brand-new `.contexture.json` (onboarding chat prompt vs empty canvas).

None of the above blocks Phase 2 kickoff.
