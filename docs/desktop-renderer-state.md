# Desktop Renderer State

The desktop renderer uses Zustand for long-lived application state. Keep stores
deep: callers should dispatch lifecycle actions, not coordinate several fields
from React effects.

## Ownership

- `useUndoStore` owns the live Schema and undo/redo transactions. UI and agent
  flows mutate the Schema through Ops.
- `useDocumentStore` owns document lifecycle state: file path, bundle mode,
  dirty state, and the layout sidecar.
- `useSchemaAgentSessionStore` owns volatile schema-agent runtime state:
  transcript messages, streaming state, readiness, auth prompts, provider thread
  references, and desync state.
- `useSchemaAgentChat` is the provider adapter over that store: it wires IPC
  subscriptions, provider/model settings, and chat sidecar serialization.
- `useChatThreadStore` owns file-backed chat threads and the active thread id.
  Untitled chats are ephemeral and must not create persisted threads.
- Small UI stores such as selection, sidebar chrome, layout config, drift, and
  reconcile own only their local UI state.

## Lifecycle Actions

Prefer these document actions over setting fields directly:

- `resetForNewBundle()` when New creates an untitled bundle.
- `acceptOpenedBundle({ filePath, layout })` after a bundle opens.
- `acceptRestoredSession({ layout })` after unsaved session restore.
- `noteSchemaChanged()` when the Schema changes.
- `noteAutosaveSucceeded()` after autosave completes.
- `markBundleSaved(filePath)` after explicit Save or Save As completes.

Prefer these chat/thread actions over localStorage or provider-thread bridge
calls in UI components:

- `enterDocumentScope(filePath)` when the selected Contexture file changes.
- `persistActiveTranscript(...)` when file-backed chat messages change.
- `createFileThread(...)`, `switchThread(id)`, and `deleteThread(id, filePath)`
  for thread list actions.
- `hydrateHistory(history)` and `toHistory()` for chat sidecar load/save.

Provider thread activation lives inside `useSchemaAgentChat.hydrateHistory()`.
Components should not call `window.contexture.schemaAgent.threadSet()` or
`threadClear()` directly.

## Adapter Hooks

Hooks that talk to Electron or browser APIs are adapters:

- `useFileMenu` handles menu/open/save IPC, then dispatches document and chat
  lifecycle actions.
- `useProjectAutoSave` observes Schema changes and writes the current bundle
  snapshot using document layout plus the chat sidecar snapshot.
- `useSessionPersistence` handles untitled-session localStorage, then dispatches
  document restore lifecycle actions.

If a hook starts combining document fields, layout state, chat transcript,
provider thread references, and persistence by hand, move that behavior behind
a lifecycle action first.
