# Convex Scaffold — Detailed Plan

> Turn Contexture into a context-engineering tool for AI agents by adding a project mode that scaffolds a Convex + Next.js monorepo, owns the schema as structured IR, and reconciles hand-edits to the emitted Convex schema back into the IR via an LLM-assisted diff flow.

---

## Scope statement

Contexture is a context-engineering tool for AI agents. In v1, "context" means one thing: the data schema.

- Contexture scaffolds a project so an AI coding agent (Claude Code, Cursor, etc.) has a ready-made substrate to work in.
- Contexture owns the Convex schema (and its Zod / JSON mirrors) as a structured artifact that agents and humans can both reason about.
- Contexture reconciles hand-edits to the emitted Convex schema back into the IR via an LLM-assisted diff flow.
- Everything else — implementation, routing, state, UI, deploy, tests — happens in the coding agent's IDE. Contexture does not manage dev servers, logs, or processes.

Future growth (memory, other AI-context artifacts) follows the same pattern. v1 is schema-only.

---

## Two modes

### Scratch mode

- Single `<name>.contexture.json` file on disk. Nothing else.
- No layout persistence, no chat persistence, no emitted sibling files.
- For quick exploration, sketching a domain, learning Contexture.
- Cmd+S writes the IR. Explicit save, dirty-indicator behaviour.
- Close the file → layout and chat are gone.

### Project mode

- A full Turborepo monorepo. The IR is one asset inside it.
- Directory layout:
  ```
  <project-name>/
    apps/
      web/                           # Next.js + shadcn + Convex
        convex/
          schema.ts                  # @contexture-generated, watched, reconciled
          <table>.ts                 # @contexture-seeded, one per table, edit freely
        app/, components/, …         # owned by user / coding agent
    packages/
      schema/
        <name>.contexture.json       # source of truth (the IR)
        <name>.schema.ts             # @contexture-generated (Zod mirror)
        <name>.schema.json           # @contexture-generated (JSON Schema mirror)
        index.ts                     # re-export
        package.json                 # private workspace package
        .gitignore                   # ignores .contexture/
        .contexture/
          layout.json                # graph positions
          chat.json                  # chat history
          emitted.json               # hash manifest for drift detection
          scaffold.log               # stage log from initial scaffold
      ui/                            # shadcn-provided
    CLAUDE.md                        # root-level, teaches coding agents the contract
    biome.json, turbo.json, …
  ```
- Auto-save on every IR edit (debounced). Re-emits all `@contexture-generated` files on each save.
- CRUD files under `apps/web/convex/` are seeded once by the scaffolder; Contexture does not regenerate them afterwards.
- `.contexture/` is gitignored by default. The IR itself is committed.

### Transitions

- **Scratch → Project:** via the **File → New Project…** dialog's "Promote an existing scratch file" radio. In-memory chat is preserved at conversion time.
- **Project → Scratch:** not supported in v1. Once committed to a project, you stay in it.

---

## Architecture

Two collaborating pieces. No embedded terminal, no markdown skill file.

1. **Main-process scaffolder** — `scaffoldProject(config): AsyncIterable<StageEvent>`. Orchestrates ten fully non-interactive stages using `child_process.spawn`. Streams events to the renderer over IPC. Fail-loud, leave-intact, no rollback.
2. **IR + emitter additions** — extends the existing renderer-side IR and emitter pipeline with `table?` / `indexes?` on object types, a Convex schema emitter, a per-table CRUD emitter, and a `CLAUDE.md` template. Pure functions, unit-testable.

A small main-process module also handles **drift detection** (watching `apps/web/convex/schema.ts`) and invokes the **LLM-assisted reconcile** flow when the file drifts from its last-emitted hash. The reconcile flow is a TypeScript-constructed Claude prompt fed through the existing chat infrastructure — not a skill file.

---

## File-format contract

| File                                   | Contract                 | Re-emitted on save? | Watched for drift? | Gitignored? |
| -------------------------------------- | ------------------------ | ------------------- | ------------------ | ----------- |
| `packages/schema/<n>.contexture.json`  | source of truth          | yes (IT is the IR)  | no                 | no          |
| `packages/schema/<n>.schema.ts`        | `@contexture-generated`  | yes                 | no                 | no          |
| `packages/schema/<n>.schema.json`      | `@contexture-generated`  | yes                 | no                 | no          |
| `packages/schema/index.ts`             | `@contexture-generated`  | yes                 | no                 | no          |
| `packages/schema/.contexture/*`        | Contexture internal      | on state change     | no                 | **yes**     |
| `apps/web/convex/schema.ts`            | `@contexture-generated`  | yes                 | **yes**            | no          |
| `apps/web/convex/<table>.ts`           | `@contexture-seeded`     | **no** (after scaffold) | no             | no          |
| Root `CLAUDE.md`                       | scaffold-time template   | no                  | no                 | no          |
| Root `biome.json`, `turbo.json`, etc.  | scaffold-time            | no                  | no                 | no          |

Every `@contexture-generated` file carries a header banner:
```ts
// @contexture-generated — do not edit by hand. Regenerated on every IR save.
```

Every `@contexture-seeded` file carries:
```ts
// @contexture-seeded — Contexture created this on scaffold. Edit freely; not regenerated.
```

---

## IR additions

All additive, optional, backwards-compatible at the IR schema level.

- **`table?: boolean`** on the `ObjectTypeDef` variant. Only table-flagged object types become Convex `defineTable`; everything else is embedded `v.object`. Default false.
- **`indexes?: Array<{ name: string; fields: string[] }>`** on the `ObjectTypeDef` variant. List of named indexes, each a non-empty array of existing field names.
- **No IR-level Convex validation.** The IR remains mode-agnostic — scratch-mode users can set `table: true` and it just does nothing. Convex-specific validation (`_`-prefix rule on table names and field names) lives in the Convex emitter, not in `IRSchema`.

### New ops (added to the op vocabulary in `apps/desktop/src/main/ops/index.ts`)

- `set_table_flag { typeName, table }`
- `add_index { typeName, name, fields }`
- `remove_index { typeName, name }`
- `update_index { typeName, name, patch: { name?, fields? } }`

All four follow the existing strict-schema pattern for field-level ops. Handlers forward to the renderer's op-applier.

---

## Detail panel UI

### "Convex" collapsible section (project mode only)

Added to `TypeDetail.tsx` for `ObjectTypeDef`. Hidden entirely in scratch mode.

- Top of section: checkbox **Use as Convex table**. Toggling dispatches `set_table_flag`.
- When checked, the section expands to show:
  - **Indexes** list. Each row: name input + multi-select of the type's fields. Trailing delete button per index.
  - **Add index** button at the bottom — appends an empty index, opens the name input for immediate edit.
- Dispatches `add_index` / `remove_index` / `update_index` on blur / confirm.

### Graph node indicator

When `table: true`, the node renders a distinct visual treatment (a subtle border accent or an icon). Read-only signal — no click-to-toggle on the canvas.

### Inline validation

When the selected type is table-flagged, name/field inputs validate against the Convex `_`-prefix rule live:

- Type name starting with `_` → red border, tooltip `"Convex reserves names starting with '_'"`.
- Field name starting with `_` → same.
- Field name matching `_id` or `_creationTime` → same (these are Convex-reserved system fields).

The emitter also enforces the rule as a final backstop, catching ops that bypass the UI (e.g. chat-driven ops, raw JSON edits).

---

## Scaffolder — ten stages

All stages are fully non-interactive. No pty, no TUI. Each stage is a pure function returning a `StageEvent` stream.

### Pre-flight (stage 0, synchronous, <100ms)

- `bun --version` succeeds.
- `git --version` succeeds.
- `node --version` succeeds (sanity).
- HEAD `https://registry.npmjs.org` returns 200 (network reachable).
- Target parent directory exists and is writable.
- Target project directory does NOT exist.
- At least ~500MB free on target's partition.

Any failure short-circuits the dialog with a specific error message. The user never sees the progress modal.

### Stage list

| # | Command / action                                                                                          | Notes |
|---|-----------------------------------------------------------------------------------------------------------|-------|
| 1 | `bunx create-turbo@latest <name> --package-manager bun --skip-install`                                    | Bones of monorepo, no install yet |
| 2 | `rm -rf <name>/apps/web`                                                                                  | Drop whatever default web app create-turbo produced |
| 3 | `bunx create-next-app@latest <name>/apps/web --ts --app --tailwind --eslint --use-bun --yes`              | Install latest Next.js at canonical path |
| 4 | `bunx shadcn@latest init --yes` inside `<name>/apps/web`                                                  | Adds shadcn to existing Next.js app (non-interactive) |
| 5 | `bunx convex@latest dev --once --configure=new --local` inside `<name>/apps/web`                          | Creates local deployment, writes `.env.local` |
| 6 | Create `<name>/packages/schema/`; emit `<name>.contexture.json`, `<name>.schema.ts`, `<name>.schema.json`, `index.ts`, `package.json`, `.gitignore`, `.contexture/` with empty `layout.json` / `chat.json` / `emitted.json` | Pure file writes |
| 7 | Emit `<name>/apps/web/convex/schema.ts` + per-table `<table>.ts` seed files | Pure file writes |
| 8 | Stitch workspace dep `@<project>/schema: workspace:*` into `<name>/apps/web/package.json`; write root `CLAUDE.md`; write Contexture `biome.json`; ensure root `.gitignore` includes the usual entries | Pure file writes / merges |
| 9 | `bun install` at root                                                                                     | Resolves new workspace dep |
| 10| If the user supplied a domain description: Claude `query()` over the empty IR, apply returned ops, re-emit derived files. If the user promoted a scratch file: copy the scratch IR into `packages/schema/<name>.contexture.json`, preserve in-memory chat into `.contexture/chat.json`, re-emit derived files. Otherwise: skipped (but the dialog enforces one-or-the-other, so this path never fires in v1) | Uses existing chat infrastructure + op-applier |

### Stage 10 (domain description → IR)

Reuses the existing chat system prompt and op-tool-bridge. The first (and only) user message is:

```
You are seeding the initial schema for a new project. The user described it as:

"{{DESCRIPTION}}"

Emit ops to populate the empty IR with the types that best model this domain.
Flag every type that represents a stored entity with table: true.
Prefer minimal, orthogonal schemas over encyclopaedic ones.
```

Ops are validated by `IRSchema.parse` at the op-applier gate before touching the IR. If Claude returns something invalid, the scaffold surfaces it as a stage-10 failure and offers retry.

### Failure policy

- **Fail-loud, leave-intact.** Any stage failure stops the scaffold. The progress modal shows which stage failed, the captured stdout/stderr, and three buttons: **Open folder**, **Retry from stage N** (if safe), **Delete and start over** (with confirm).
- Retry-from-stage is only offered where the preceding state is idempotent-safe to re-run against. Stages 1, 2, 3, 4 require start-over on failure (they destructively shape the tree). Stages 5+ can be retried in place.
- `.contexture/scaffold.log` is written at the end of the run regardless of outcome, containing full stdout/stderr of all stages plus timestamps.
- A **View full log** button in the success panel opens the file in the user's default editor.

### Git initialisation

At the end of stage 8, after all scaffold files are in place:

```
git init
git add .
git commit -m "Initial scaffold by Contexture"
```

No checkbox in the dialog — always done. If `create-turbo` already `git init`ed, the second `init` is a no-op. The commit captures everything including the Contexture-added files.

---

## New Project dialog

Triggered by **File → New Project…**. Modal.

```
┌──────────────────────────────────────────────────────────────┐
│ New Project                                                  │
├──────────────────────────────────────────────────────────────┤
│ Project name:       [my-app               ]                  │
│ Parent directory:   /Users/dave/Code      [Choose…]          │
│                     → /Users/dave/Code/my-app                │
│                                                              │
│ Starting point (required):                                   │
│   ( ) Describe what you're building                          │
│       ┌──────────────────────────────────────────┐           │
│       │ An e-commerce app with products,         │           │
│       │ carts, and orders                        │           │
│       └──────────────────────────────────────────┘           │
│                                                              │
│   ( ) Promote an existing scratch file                       │
│       [Choose .contexture.json…]                             │
│       → /Users/dave/Documents/blog-schema.contexture.json    │
│                                                              │
│                                   [Cancel]  [Create]         │
└──────────────────────────────────────────────────────────────┘
```

- Project name: kebab-cased, validated live. Pre-filled from the current scratch file's `metadata.name` / filename if one is open.
- Parent directory: Electron folder picker. Computed target path below shows a red error if it already exists.
- Two mutually-exclusive starting-point radios. One must be selected. **Create** is disabled until name, parent, and a starting point are all valid.
- No "include demo page" checkbox (no demo page in v1).
- No Convex team/project picker (`--local` deployment, no cloud account needed).

Clicking **Create** runs pre-flight synchronously. On pre-flight failure, the dialog shows the specific error inline. On pre-flight success, the dialog is replaced by the progress modal.

### Progress modal

Replaces the dialog. Modal (blocks other Contexture interaction for the ~60–180s duration).

- Ten stage rows, each showing `pending → running → done / failed`.
- A scrollable log area beneath streams stdout/stderr from the spawned processes (read-only monospace). Auto-collapsed on success, auto-expanded on failure.
- A **Cancel** button SIGTERMs the in-flight child process. On user-initiated cancel the dir is left alone (same as failure — fail-loud, leave-intact).

### Success panel

Replaces the progress modal on completion.

- Green check + "Scaffold complete."
- Path to the new repo (copyable).
- Three actions: **Reveal in Finder/Explorer**, **Open in VS Code** (graceful fallback if `code` not on PATH — shows the copyable path instead), **Copy path**.
- **View full log** (opens `.contexture/scaffold.log`).
- Short runbook: `cd <path> && bun run dev` (copyable).
- **Close** button.

On close, Contexture switches the currently-open document to the newly-scaffolded project (equivalent to **File → Open** on `packages/schema/<name>.contexture.json`).

---

## Drift detection

### What's watched

Only `apps/web/convex/schema.ts`. Nothing else.

- `.schema.ts` / `.schema.json` / `index.ts` in `packages/schema/` are pure derivatives of the IR — no incentive to hand-edit them.
- Per-table CRUD files are seed-once; hand-edits are expected and welcome.

### How

Two parallel mechanisms, both gated by hash comparison against `.contexture/emitted.json`:

1. **`fs.watch`** — reactive. When Contexture is focused, drift surfaces immediately. Debounced 300ms to avoid editor-save thrash.
2. **Focus-check** — on Contexture window `focus` event, compute the hash of the watched file and compare. Catches events missed by `fs.watch` (network filesystems, editor-save patterns).

### Signal

When drift is detected:

- A non-blocking banner appears at the top of the graph view: `"apps/web/convex/schema.ts was modified outside Contexture. [Review changes] [Dismiss]"`.
- Dismiss hides the banner until the next drift-detection event.
- Review changes opens the reconcile modal.

The banner is non-blocking. The user can continue working in Contexture, and a subsequent auto-save will *not* overwrite the drifted file — auto-save is paused for the watched file while drift is unresolved. The detail panel surfaces this as a small indicator ("Convex schema out of sync").

### Self-write suppression

Every time Contexture writes `apps/web/convex/schema.ts`, it updates `.contexture/emitted.json` with the new hash *before* the file watcher fires. On watcher fire, if the on-disk hash matches the recorded hash, the event is ignored. No banner, no false positive.

---

## Reconcile flow (LLM-assisted)

User clicks **Review changes**. A modal opens:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Reconcile Convex schema                                                 │
├───────────────────────────┬─────────────────────────────────────────────┤
│ Proposed IR changes       │ apps/web/convex/schema.ts                   │
│                           │                                             │
│ [x] + Add field 'title'   │  ← @pierre/diffs split view                 │
│     to Post               │                                             │
│ [x] ~ Rename 'isPub' →    │  left:  current Contexture emit             │
│     'published' on Post   │  right: what Contexture would emit          │
│ [ ] + Add index by_author │         after applying checked ops          │
│     to Post  ⚠ lossy      │                                             │
│                           │                                             │
│ 2 of 3 selected           │ Residual: 0 lines                           │
├───────────────────────────┴─────────────────────────────────────────────┤
│              [Cancel]  [Open in chat]  [Apply selected]                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Mechanism

1. On modal open: `useClaudeReconcile(irJson, convexSrc)` hook fires a Claude `query()` call with a specialised system prompt (TypeScript-constructed, not a skill file) that teaches Claude the op vocabulary and asks for ops that align the IR to the user's edited Convex schema.
2. Returned ops are **validated through `IRSchema.parse`** at the op-applier gate. Invalid ops are rejected before rendering; the modal shows an error with a retry button.
3. Each proposed op renders as a human-readable checkbox row. The LLM also emits an optional `lossy: true` flag on any op that represents a Convex construct the IR can only partially represent — rendered with a ⚠ badge.
4. **Reactive right pane:** toggling a checkbox re-runs the Convex emitter over the IR-with-selected-ops-applied, and `@pierre/diffs` renders the diff between that output and the user's edited file. The **residual line count** under the right pane shows how many lines remain different after applying the currently-selected ops. Goal state: zero residual.
5. **Apply selected** runs the checked ops through the normal op-applier, triggers a re-emit, and closes the modal. The hash check realigns; the banner disappears.
6. **Open in chat** copies the full context (IR JSON + Convex source + proposed ops) into a new chat thread so the user can iterate if the LLM got it wrong.
7. **Cancel** leaves everything in drift state; banner remains.

### Scope — what reconciles and what doesn't

- Only `apps/web/convex/schema.ts` reconciles. CRUD and any future generated files are either seed-once or out of scope.
- Reconcile only runs against projects Contexture scaffolded (they have the `.contexture/` dotfolder with the emit manifest). Adoption of existing non-Contexture Convex projects is deferred.

---

## Root `CLAUDE.md`

Static template with `{{PROJECT_NAME}}` substitution. Written at scaffold stage 8. Never regenerated after scaffold (the user / coding agent owns it from then on). Concise voice, no filler.

### Contents (structural outline)

1. **What this project is.** One paragraph: "This is a Convex + Next.js monorepo scaffolded by Contexture. Schema source of truth is `packages/schema/{{PROJECT_NAME}}.contexture.json`, re-emitted to `apps/web/convex/schema.ts` automatically."
2. **Directory layout.** Short tree.
3. **The source-of-truth rule.** "Do NOT edit `apps/web/convex/schema.ts` directly — it is regenerated from the IR. To change the schema, edit the `.contexture.json` file (or ask the user to use Contexture)."
4. **Escape hatch acknowledgement.** "If you do edit `apps/web/convex/schema.ts`, Contexture detects the drift and offers the user a reconcile flow. Your edits won't be silently clobbered, but they'll need user confirmation to apply back to the IR."
5. **CRUD files are yours.** "`apps/web/convex/<table>.ts` are seeded once and not regenerated. Add queries, mutations, and indexes as the app requires."
6. **How to use the schema from app code.** "Import Zod schemas from `@{{PROJECT_NAME}}/schema` for runtime validation and inferred types. The Convex validators in `apps/web/convex/schema.ts` are derived from the same source."
7. **Conventions.** "Use Zod for all user-input validation. Prefer `z.infer<>` over hand-writing TypeScript interfaces."
8. **Local Convex.** "Convex runs as a local-only deployment (`convex dev --local`). Data is stored on this machine under `~/.convex/`. Do not assume a cloud deployment."
9. **If the user asks you to add a table.** Short runbook: edit the IR JSON, set `table: true`, save, verify Contexture re-emitted the Convex schema.
10. **What NOT to touch.** `.contexture/` — Contexture's internal state (layout, chat history, emit manifest).
11. **Commands.** `bun run dev`, `bun run build`, `bun run test`, `bun run lint`.
12. **Contexture reference.** "This project is edited with Contexture. If the user mentions 'the canvas' or 'the graph,' they mean Contexture's visual schema editor."

Target length: ~80 lines.

---

## Implementation order

Dependency-ordered. Small PRs, no feature flag, continuous merges to `main`. Targeted for 0.15.x release series.

1. **IR additions** — `table?`, `indexes?` on `ObjectTypeDef`; new ops (`set_table_flag`, `add_index`, `remove_index`, `update_index`); `IRSchema` + op-tool-bridge updates; validator and applier tests.
2. **Detail panel UI** — "Convex" collapsible section (project-mode only, detection stub until milestone 4 lands); table toggle; indexes multi-select; graph node indicator for table-flagged types; UI-level `_`-prefix validation.
3. **Emitters** (pure functions, no I/O):
   - Convex schema emitter (IR → `apps/web/convex/schema.ts` with `defineTable` / `v.*` / indexes). Includes emit-time `_`-prefix validation.
   - Per-table CRUD emitter (IR → one file per table, with `@contexture-seeded` banner).
   - `CLAUDE.md` template + `{{PROJECT_NAME}}` substitution.
   - `.gitignore` generators (root + `packages/schema/.gitignore` for `.contexture/`).
4. **File-format split: scratch vs. project** — extend `DocumentStore`:
   - Scratch mode: read/write single `<name>.contexture.json`. Drop layout/chat persistence on save.
   - Project mode: detect project layout on open; auto-save on every op (debounced 500ms); re-emit all `@contexture-generated` files; update `.contexture/emitted.json` hash manifest.
   - Both modes round-trip cleanly through existing `open` / `save` / `saveAs`.
5. **Scaffolder** — main-process `scaffoldProject(config): AsyncIterable<StageEvent>`:
   - Stages 1–9 (pre-flight, create-turbo, wipe apps/web, create-next-app, shadcn init, convex --local, emit derived files, stitch workspace + CLAUDE.md + biome.json + root gitignore, bun install, git init + initial commit).
   - Stage log persistence to `.contexture/scaffold.log`.
   - Failure policy (fail-loud, leave-intact, retry-from-stage where safe).
   - IPC surface to renderer.
6. **Scaffold UI** — `File → New Project…` menu item, dialog (name / parent dir / mutually-exclusive starting-point radios), progress modal, success panel. Handles both "describe" and "promote scratch" flows.
7. **Stage 10: LLM domain-description → IR seeding** — TypeScript-constructed prompt, reuses existing chat infrastructure, applies ops to the freshly-scaffolded empty IR, re-emits.
8. **Drift detection** — `fs.watch` on `apps/web/convex/schema.ts` + focus-check; hash comparison against `.contexture/emitted.json`; non-blocking banner; auto-save suppression while drift unresolved.
9. **Reconcile flow** — `useClaudeReconcile` hook, reconcile modal with Option-D two-pane UI (semantic ops checklist + reactive `@pierre/diffs` pane + residual-line count + "Open in chat" escape hatch).
10. **Scratch-promotion path inside New Project dialog** — the "Promote an existing scratch file" radio actually wires up (picks a `.contexture.json`, validates, copies into the new project's `packages/schema/`, preserves in-memory chat if the chosen scratch is currently open in Contexture).

---

## Out of scope for v1 (deferred)

- Vercel deploy integration.
- Auth scaffolding (Clerk, Convex Auth, etc.).
- Local → cloud Convex deployment graduation ("Deploy" button).
- Template variants (Remix, Expo, Node CLI, plain Node API). The compose-from-parts scaffolder was chosen partly to keep this path open.
- Multi-app scaffolds (mobile, admin).
- Bidirectional TS-parser sync (proper AST-based reconcile without an LLM).
- Memory and other context-artifact types beyond schema.
- `shadcn add` / git ops / logs pane / route emission, all driven from Contexture.
- Embedded dev-server or Convex log panels.
- Adopt-an-existing-Convex-project flow (pathway D — reconcile LLM flow repurposed for empty IR).
- Scaffold-failure diagnosis skill.

---

## Permanent design decisions (NOT deferrals)

- CRUD files are seed-once. Never regenerated after scaffold.
- No demo page. Ever. The user's coding agent builds real UI.
- Only `schema.ts` reconciles on drift.
- Scratch mode does not persist layout or chat.
- `.contexture/` is gitignored by default.
- `convex dev` runs `--local` only in v1. Cloud deployment is a future, distinct feature.
- No embedded terminal. Non-interactive scaffold throughout.
- No markdown skill files for scaffolding or reconcile. Plain TypeScript, deterministic where it can be, LLM-called where it needs to be.
- Contexture spawns nothing long-running. Coding agents + IDEs own the dev loop.

---

## Open questions

Empirical, to be settled during implementation — not design debates.

- Does `bunx create-next-app@latest` with `--use-bun --yes` produce output that `bunx shadcn@latest init --yes` consumes cleanly out of the box? If the two ever drift, pin versions defensively.
- Does `bunx convex@latest dev --once --configure=new --local` write an `.env.local` we can rely on without tweaks?
- What's the real failure surface of `fs.watch` on macOS vs. Windows vs. Linux for this specific use case (one file, long-running watch)? Focus-check is the designed fallback if `fs.watch` proves flaky.
- How often does the LLM-reconcile produce non-empty residual lines in practice? Drives future decisions about whether to invest in a proper TS parser.
