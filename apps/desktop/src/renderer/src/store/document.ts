/**
 * Document-level state — the path and dirty flag for the open
 * `.contexture.json` file, the bundle layout sidecar, plus a slot for
 * dialog payloads that belong to the file lifecycle (import warnings,
 * failed-format open, save-while-invalid prompt).
 *
 * Kept separate from the IR (`useUndoStore`) and UI chrome / selection
 * stores because it has different lifetimes:
 *   - The IR changes on every op; the path only changes on open/save-as.
 *   - Layout changes are document sidecar state, so they live with the
 *     document lifecycle rather than in App component state.
 *   - The document lifecycle records schema changes, opened bundles,
 *     explicit saves, and autosave completion as domain events instead
 *     of making callers coordinate path/mode/dirty/layout fields.
 */
import type { Layout } from '@contexture/core';
import { create } from 'zustand';

/** Desktop documents always save as full Contexture bundles. */
export type DocumentMode = 'bundle';

export interface ImportWarning {
  /** The underlying loader message (migrations, missing sidecar, …). */
  message: string;
  /** Severity is typically `warning`; reserved for future error cases. */
  severity: 'error' | 'warning';
}

export interface SaveWithErrorsPrompt {
  /** Opaque token a caller can key off when deciding whether to force-save. */
  id: string;
  /** Messages mirrored from the validator so the user sees the blockers. */
  messages: string[];
}

export interface FileAccessError {
  message: string;
  path?: string;
}

export const DEFAULT_LAYOUT: Layout = { version: '1', positions: {} };

interface DocumentState {
  /** Absolute path of the open `.contexture.json`, or `null` for a new file. */
  filePath: string | null;
  /** True when the in-memory IR diverges from the last save. */
  isDirty: boolean;
  /** Desktop document persistence mode. */
  mode: DocumentMode;
  /** Graph layout sidecar for the current document or untitled session. */
  layout: Layout;

  /** Non-empty while the import-warnings dialog is visible. */
  importWarnings: ImportWarning[];
  /** Non-null while the format-unknown dialog is visible. */
  unknownFormatPath: string | null;
  /** Non-null while the save-with-errors dialog is visible. */
  saveWithErrorsPrompt: SaveWithErrorsPrompt | null;
  /** Non-null while a filesystem permission/open error dialog is visible. */
  fileAccessError: FileAccessError | null;

  setFilePath: (path: string | null) => void;
  setMode: (mode: DocumentMode) => void;
  setLayout: (layout: Layout) => void;
  resetLayout: () => void;
  resetForNewBundle: () => void;
  acceptOpenedBundle: (input: { filePath: string; layout?: Layout }) => void;
  acceptRestoredSession: (input: { layout?: Layout }) => void;
  markBundleSaved: (filePath: string) => void;
  noteSchemaChanged: () => void;
  noteAutosaveSucceeded: () => void;
  markDirty: () => void;
  markClean: () => void;

  showImportWarnings: (warnings: ImportWarning[]) => void;
  clearImportWarnings: () => void;

  showUnknownFormat: (filePath: string) => void;
  clearUnknownFormat: () => void;

  showSaveWithErrors: (prompt: SaveWithErrorsPrompt) => void;
  clearSaveWithErrors: () => void;

  showFileAccessError: (error: FileAccessError) => void;
  clearFileAccessError: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  filePath: null,
  isDirty: false,
  mode: 'bundle',
  layout: DEFAULT_LAYOUT,
  importWarnings: [],
  unknownFormatPath: null,
  saveWithErrorsPrompt: null,
  fileAccessError: null,

  setFilePath: (filePath) => set({ filePath }),
  setMode: (mode) => set({ mode }),
  setLayout: (layout) => set({ layout }),
  resetLayout: () => set({ layout: DEFAULT_LAYOUT }),
  resetForNewBundle: () =>
    set({
      filePath: null,
      mode: 'bundle',
      layout: DEFAULT_LAYOUT,
      isDirty: false,
    }),
  acceptOpenedBundle: ({ filePath, layout }) =>
    set({
      filePath,
      mode: 'bundle',
      layout: layout ?? DEFAULT_LAYOUT,
      isDirty: false,
    }),
  acceptRestoredSession: ({ layout }) =>
    set({
      filePath: null,
      mode: 'bundle',
      layout: layout ?? DEFAULT_LAYOUT,
    }),
  markBundleSaved: (filePath) =>
    set({
      filePath,
      mode: 'bundle',
      isDirty: false,
    }),
  noteSchemaChanged: () => set({ isDirty: true }),
  noteAutosaveSucceeded: () => set({ isDirty: false }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  showImportWarnings: (importWarnings) => set({ importWarnings }),
  clearImportWarnings: () => set({ importWarnings: [] }),

  showUnknownFormat: (unknownFormatPath) => set({ unknownFormatPath }),
  clearUnknownFormat: () => set({ unknownFormatPath: null }),

  showSaveWithErrors: (saveWithErrorsPrompt) => set({ saveWithErrorsPrompt }),
  clearSaveWithErrors: () => set({ saveWithErrorsPrompt: null }),

  showFileAccessError: (fileAccessError) => set({ fileAccessError }),
  clearFileAccessError: () => set({ fileAccessError: null }),
}));
