# Contexture Sync Experience Implementation Plan

## Goal

Make the desktop canvas stay trustworthy when the open `.contexture.json` is
changed outside the renderer by MCP, CLI, external agents, or raw file edits.

Contexture should remain the domain-model control plane:

- The `.contexture.json` IR is the source of truth.
- Desktop reflects the latest valid model without surprising the user.
- Invalid or conflicting source changes are explicit and recoverable.
- Generated-target drift remains a separate concern from model sync.

## Current Architecture Findings

- `DocumentStore` owns open/save/save-as for the bundle in
  `apps/desktop/src/main/documents/document-store.ts`.
- `useProjectAutoSave` writes schema, layout, chat, generated targets, and the
  emitted manifest 500ms after renderer schema edits.
- `createDriftWatcher` watches generated target paths from
  `.contexture/emitted.json`, but there is no equivalent watcher for the IR
  source file.
- `useDrift` bridges generated drift to the renderer and runs a manual check on
  window focus.
- `StatusBar` currently exposes saved/unsaved, validation, counts, and token
  estimates. It has no sync state slot yet.
- `DriftBanner` is specifically about generated files modified outside
  Contexture. That language should not be reused for source IR sync.
- Schema-agent chat applies Ops in the renderer through `schema-agent:tool-request`
  and sends `schema-agent:set-ir` before a turn. External MCP/CLI Ops mutate the
  file directly through `createFileBackedForward`, bypassing the open renderer.
- Provider thread desync already exists as a concept, but external model changes
  are not currently wired to mark active chat context stale.

## UX Direction

Valid external model changes should feel almost invisible. Unsafe changes should
be explicit, recoverable, and attributable.

Primary interaction levels:

1. Clean auto-sync
   - Auto-load valid external IR changes when there are no local model edits.
   - Show a temporary status event such as `Synced from MCP · 3 changes`.
   - Preserve selection when possible. Follow renames when detectable. Clear
     selection if the selected type was deleted.

2. Review banner
   - Show a top-of-canvas banner when valid external changes arrive while local
     model state is dirty, a chat turn is active, or applying would be unsafe.
   - Copy: `External model changes are ready`
   - Supporting copy: `MCP changed .contexture.json while you have unsaved edits.`
   - Actions: `Review`, `Apply external changes`, `Keep current canvas`

3. Blocking attention
   - Use a dialog only for invalid JSON, invalid IR, semantic failure, or a true
     local/external conflict.
   - Copy: `Model needs attention`
   - Body: `.contexture.json changed outside Contexture, but the file is not valid Contexture IR. The canvas is still showing the last valid model.`
   - Actions: `Open file`, `Reload last valid`, `Retry`

4. Generated drift remains separate
   - Model sync labels: `Synced`, `External changes`, `Model conflict`,
     `Invalid model`.
   - Generated drift labels: `Generated files drifted`, `Review generated changes`,
     `Re-emit`.

## Canvas Change Highlight Recommendation

Use limited highlighting as an orientation aid, not as the primary signal.

- Highlight only small clean auto-syncs, roughly 1 to 8 changed visible nodes.
- Use a temporary non-layout-affecting outline/ring for changed nodes.
- Do not recolor nodes permanently and do not reuse selection/adjacency styling.
- Do not add badges unless node chrome already has stable space, because resizing
  nodes would move the graph and create confusion.
- Do not highlight field-level changes inside node bodies. Surface field changes
  in a change summary or already-open detail panel.
- Respect `prefers-reduced-motion`: no pulse, only a static temporary outline.
- For large syncs, metadata-only changes, conflicts, invalid IR, or active manual
  selection where selection clarity would suffer, prefer the status event and
  change summary only.

The status event and change summary are the accessible source of truth. Canvas
highlighting is supplemental.

## Proposed State Model

Add a renderer sync store separate from generated drift:

```ts
type DocumentSyncState =
  | "saved"
  | "unsaved_changes"
  | "syncing"
  | "synced"
  | "external_changes"
  | "model_conflict"
  | "invalid_model";
```

Suggested event payload:

```ts
interface ModelSyncEvent {
  source: "desktop" | "mcp" | "cli" | "external" | "unknown";
  status:
    | "changed"
    | "invalid_json"
    | "invalid_ir"
    | "semantic_error"
    | "unreadable"
    | "deleted";
  irPath: string;
  content?: string;
  observedAt: number;
  revision: string;
}
```

Renderer-derived summary:

```ts
interface ModelChangeSummary {
  source: ModelSyncEvent["source"];
  changedTypes: string[];
  addedTypes: string[];
  removedTypes: string[];
  renamedTypes: Array<{ from: string; to: string }>;
  visibleChangedNodeIds: string[];
  changeCount: number;
}
```

The initial implementation can derive summaries by comparing the last rendered
schema to the newly loaded schema. Exact Op history can be added later.

## Implementation Slices

### 1. Main-side IR watcher

Create a source-model watcher alongside, but separate from, `drift-watcher`.

Suggested files:

- Add `apps/desktop/src/main/documents/model-sync-watcher.ts`
- Add `apps/desktop/src/main/ipc/model-sync.ts`
- Register it from `apps/desktop/src/main/app-main.ts`
- Expose it through `apps/desktop/src/preload/index.ts` and `index.d.ts`

Responsibilities:

- Watch the open `.contexture.json`.
- Debounce changes, default around 200-300ms.
- Read the file and classify as valid, invalid JSON/IR, unreadable, or deleted.
- Emit renderer events on meaningful external changes.
- Provide `watch`, `unwatch`, `check`, and `acknowledgeSelfWrite` style APIs.

Self-write suppression is required because `useProjectAutoSave` writes the same
file. The least surprising implementation is to track the last saved revision:

- Main `file:save` returns or internally records a content hash/revision for the
  IR it just wrote.
- The model-sync watcher compares the observed on-disk hash with the most recent
  self-write hash for the open path.
- Matching self-writes do not produce external sync events.
- Non-matching writes are treated as external.

Tests:

- Detects valid external IR changes.
- Does not report `file:save` or autosave self-writes.
- Reports invalid JSON without crashing.
- Reports deleted/unreadable IR.
- Debounces rapid writes into one event.

### 2. Renderer sync store and hook

Create renderer state for source model sync.

Suggested files:

- Add `apps/desktop/src/renderer/src/store/model-sync.ts`
- Add `apps/desktop/src/renderer/src/hooks/useModelSync.ts`
- Mount `useModelSync()` in `App.tsx` near `useDrift()`

Responsibilities:

- Start/stop the main watcher for the open bundle path.
- On valid external change:
  - If there are no unsaved local model edits and no active turn, parse and apply
    via `replace_schema`.
  - Mark document clean for the loaded external revision.
  - Record a temporary `synced` status event.
  - Build a `ModelChangeSummary` for status text and optional highlights.
- On local dirty state:
  - Store pending external content.
  - Set state to `external_changes`.
  - Show a review banner.
- On invalid state:
  - Keep the last valid model visible.
  - Set state to `invalid_model`.
  - Expose details for a blocking dialog or banner.

Important implementation detail:

`useFileMenu` currently marks every schema-reference change dirty. Loading an
external schema through `replace_schema` would trip this. Add a domain-level
method such as `useUndoStore.replaceExternal(schema)` or use an explicit sync
accept path that resets document dirtiness after the store update.

Tests:

- Clean external valid IR updates the undo store and document status.
- Dirty local document does not auto-apply external content.
- Invalid external IR keeps the old schema visible.
- Pending external content can be applied by user action.
- Window focus triggers a sync check, mirroring `useDrift`.

### 3. Status bar sync surface

Extend `StatusBar` with a sync status slot.

Suggested behavior:

- Base state remains `Saved` / `Unsaved changes`.
- Temporary external success state can override the text for a few seconds:
  `Synced from MCP · 3 changes`.
- Persistent attention states appear on the right near validation:
  `External changes pending`, `Model conflict`, `Invalid model`.
- The status item should open a compact change summary popover when available.

Tests:

- Shows `Synced from MCP · N changes` for recent clean auto-sync.
- Shows `External changes pending` for dirty local state.
- Shows `Invalid model` for invalid source file.
- Keyboard users can open and close the status details popover.

### 4. Source sync banner and invalid model dialog

Add a source-model sync banner distinct from `DriftBanner`.

Suggested files:

- Add `apps/desktop/src/renderer/src/components/hud/ModelSyncBanner.tsx`
- Render it above the graph near `DriftBanner`, with model sync taking precedence
  when source IR changed.

Banner states:

- `external_changes`: valid changes are waiting behind local dirty state.
- `model_conflict`: local and external changes need explicit choice.

Dialog state:

- `invalid_model`: on-disk IR cannot be parsed or validated.

Tests:

- Banner copy does not mention generated drift.
- `Review` opens summary.
- `Apply external changes` applies pending content.
- `Keep current canvas` leaves pending content unapplied and non-destructive.
- Invalid model dialog offers `Open file`, `Reload last valid`, and `Retry`.

### 5. Limited canvas highlight

Add optional sync highlight state to graph rendering.

Suggested approach:

- Store `highlightedNodeIds` and expiry in `model-sync` store.
- Pass them into `GraphCanvas`.
- Pass a boolean through `TypeNodeData` or node `data`.
- In `TypeNode`, add a temporary outline/ring style that does not change node
  dimensions.
- Clear highlights on timeout, selection interaction, navigation, or a new sync
  event.

Rules:

- Only highlight clean auto-syncs with 1-8 changed visible nodes.
- Do not highlight when sync state is conflict/invalid.
- Do not animate if `prefers-reduced-motion: reduce`.
- Selection and adjacency visuals win over sync highlight.

Tests:

- Small clean sync adds temporary `data-sync-highlighted="true"` or equivalent.
- Large sync does not highlight nodes.
- Highlight does not change node dimensions.
- Selection style remains dominant.

### 6. Provider/chat desync handling

External model changes should make active provider context stale.

Implementation options:

- Add a preload/schema-agent method such as `schemaAgent.markExternalModelChange`.
- Or have the renderer clear/mark local chat state desynced when `useModelSync`
  applies or queues an external model event.

Behavior:

- If a chat turn is active, do not auto-apply external source changes. Queue and
  show a banner.
- If an external change is applied after a thread exists, mark the thread stale
  before the next send.
- Copy: `Model changed outside this chat. Start a new turn from the latest model.`

Tests:

- External sync during streaming queues instead of applying.
- External sync after a provider thread marks chat desynced or clears resumable
  thread state.
- Next send pushes the latest IR before provider execution.

### 7. Native notifications excluded

Native notifications are out of scope.

Do not add push or OS-level notifications for model sync. The desktop app should
communicate sync state through the status bar, source sync banner, invalid model
dialog, canvas highlight, and durable change log.

## Source Attribution

Best effort for v1:

- MCP writes: if the packaged desktop MCP server can share process state with the
  desktop window, tag as `mcp`.
- CLI writes: tag as `cli` when the CLI writes a change-log entry; otherwise
  treat as `external`.
- Raw file edits: `external`.

## Durable Change Log

Promote source attribution into a durable sidecar change log, not a short-lived
`last-change.json` marker.

Suggested file:

- `.contexture/change-log.json`

Suggested core API:

- `appendModelChangeLogEntry(input)`
- `loadModelChangeLog(irPath)`
- `pruneModelChangeLog(irPath, limit)`

Suggested entry shape:

```ts
interface ModelChangeLog {
  version: "1";
  entries: ModelChangeLogEntry[];
}

interface ModelChangeLogEntry {
  id: string;
  irPath: string;
  source: "desktop" | "mcp" | "cli" | "schema_agent" | "external";
  reason:
    | "op_applied"
    | "replace_schema"
    | "raw_file_change"
    | "external_sync_accepted"
    | "generated_emit";
  opKind?: string;
  changedTypes: string[];
  addedTypes: string[];
  removedTypes: string[];
  renamedTypes: Array<{ from: string; to: string }>;
  changeCount: number;
  beforeHash?: string;
  afterHash: string;
  createdAt: string;
  actor?: string;
  summary?: string;
}
```

Write entries from every intentional model mutation surface:

- Desktop direct manipulation and detail-panel Ops.
- Schema-agent Ops applied through the renderer.
- MCP `apply_contexture_op`.
- CLI mutation commands and `apply`.
- Reconcile applying IR Ops.
- External raw file changes accepted by the sync flow.

Do not write entries for pure generated-target emits unless the source IR also
changed. If an emit needs a record, use `reason: "generated_emit"` and keep it
visually separate from model mutation entries.

The desktop watcher should use the change log to enrich sync events:

- Match on `afterHash` to attribute source accurately.
- Use changed type hints for status text, summaries, and limited canvas
  highlights.
- Fall back to renderer-derived schema diff when no matching entry exists.

Renderer UI:

- Add a persistent right-sidebar activity tab named `Changes`.
- Add the tab to the existing activity bar next to `Properties`, `Chat`, and
  `Schema`, using a Lucide `History` or `ListTree` icon.
- The status bar may link to the latest change, but it is not the primary home
  for durable history.
- Do not use a modal for the normal change-log flow.
- The panel title is `Model changes`.
- The list is newest-first and compact enough to scan beside the canvas.
- Each row shows an operation summary, source, actor, time, affected type names
  or count, and a short system-generated summary when useful.
- Selecting a change opens an in-panel detail view.
- The change log is read-only in v1; undo/rollback remains the job of the undo
  stack and future reconcile flows.

Recommended row copy:

- Primary line: `Add type · Booking`
- Secondary line: `Desktop · Rufus · 14:32 · 2 affected types`
- Optional summary: `Added Booking and linked it to Customer`

Recommended source labels:

- `Desktop`
- `Schema agent`
- `MCP`
- `CLI`
- `Reconcile`
- `External`

Recommended operation labels:

- `Added`
- `Updated`
- `Deleted`
- `Renamed`
- `Replaced`
- `Accepted external change`

Use neutral source badges. Reserve warning/destructive colors for unreadable log
states or destructive operations. Do not rely on color alone.

Detail view:

- Header: operation summary, timestamp, source, actor.
- `Affected model`: clickable types/fields.
- `Change summary`: normalized semantic summary.
- `Raw log entry`: collapsed disclosure for debugging.
- Optional semantic diff when structured before/after data exists.
- Prefer semantic model diffs over source-code diffs.
- Avoid using the generated-target reconcile diff component unless the entry is
  specifically an accepted external/reconcile change.

Canvas behavior from the change log:

- Provide a `Focus affected` button in the detail view.
- Clicking an affected type selects/reveals that node using existing graph focus
  behavior.
- If multiple nodes are affected, fit them in view and select the primary node.
- Do not create persistent glows or trails from historical changes.

Filtering/search:

- V1 search should match summary, type names, actor, and source.
- V1 source filter: `All`, `Desktop`, `Agent`, `MCP`, `CLI`, `Reconcile`,
  `External`.
- Show a `Current selection` toggle when a canvas node is selected.
- Defer date range, operation-kind filter, actor filter, saved filters, and
  day/session grouping until the log proves it needs them.

Empty and error states:

- Empty title: `No model changes yet`
- Empty description: `Changes to this Contexture model will appear here after the file is edited, reconciled, or updated by an agent.`
- No-results title: `No matching changes`
- No-results description: `Adjust the search or filters.`
- Unreadable title: `Change log unavailable`
- Unreadable description: `Contexture could not read .contexture/change-log.json. The model is still usable.`
- Unreadable action: `Retry`
- Malformed entries: show valid entries and an inline warning row,
  `1 change could not be displayed`, with `Show details`.
- Distinction copy when useful: `Generated file drift is handled in Reconcile.`

Accessibility:

- The activity tab is a labelled button with `aria-label="Changes"`.
- The list is keyboard navigable; Enter opens the selected change detail.
- `Focus affected` is a real button, not row-only behavior.
- Icon-only controls have tooltips and accessible names.
- Source and operation are represented by text, not color alone.
- Preserve visible focus rings.
- Respect `prefers-reduced-motion`; canvas focus should not rely on animated
  pulses.
- Time text exposes absolute timestamps via `title` or accessible label.

Retention:

- Keep the most recent 200 entries by default.
- Prune on append.
- Preserve IDs and timestamps so entries are stable for UI selection.

Tests:

- MCP and CLI mutations append change-log entries with source and `afterHash`.
- Renderer-applied schema-agent Ops append entries without double-counting
  autosave.
- Raw file changes accepted through sync append `external_sync_accepted`.
- The watcher enriches a sync event from a matching `afterHash`.
- The `Changes` activity tab renders entries, details, filters, empty/error
  states, and affected-node focus.

## Suggested Delivery Order

1. Main-side IR watcher with self-write suppression and tests.
2. Renderer model-sync store/hook that auto-applies clean valid external changes.
3. Durable `.contexture/change-log.json` writer/reader in core plus
   MCP/CLI/desktop write sites.
4. Status bar sync messages, latest change summary, and pending/invalid states.
5. Source sync banner and invalid model dialog.
6. Chat/provider stale handling.
7. Limited canvas node highlights for small syncs.
8. Read-only `Changes` sidebar tab with search, source filter, details, and
   affected-node focus.

## Acceptance Checklist

- Valid external `.contexture.json` changes auto-update the canvas when the local
  model is clean.
- Autosave and manual save do not trigger false external sync events.
- Invalid on-disk IR never blanks the canvas; the last valid model remains visible.
- Dirty local model state prevents silent external apply and shows a reviewable
  source-model banner.
- Model sync and generated drift use separate stores, labels, banners, and actions.
- Rapid external Op sequences batch into one visual update and one status event.
- Provider/chat context is marked stale or prevented from continuing against an
  old model snapshot.
- Optional canvas highlight is temporary, non-resizing, accessible, and limited to
  small clean syncs.
- Durable `.contexture/change-log.json` records intentional model mutations from
  desktop, schema agent, MCP, CLI, reconcile, and accepted raw external changes.
- Users can inspect recent model changes at any time from a persistent `Changes`
  sidebar tab.
- Each change row shows source, actor, time, operation, affected model elements,
  and a short summary.
- Selecting a change shows details with affected model elements and a collapsed
  raw JSON disclosure.
- `Focus affected` reveals affected canvas nodes without making historical
  highlighting the primary UI.
- The change-log surface remains separate from chat history and generated-target
  drift/reconcile.
- Focus checks catch changes made while Contexture was backgrounded.
- Tests cover main watcher, renderer hook, status/banner behavior, change log
  behavior, and highlight rules.
