/**
 * Document-level state — the path and dirty flag for the open
 * `.contexture.json` file, plus a slot for dialog payloads that
 * belong to the file lifecycle (import warnings, failed-format open,
 * save-while-invalid prompt).
 *
 * Kept separate from the IR (`useUndoStore`) and UI chrome / selection
 * stores because it has different lifetimes:
 *   - The IR changes on every op; the path only changes on open/save-as.
 *   - The dirty flag flips on any `apply` that lands outside an open
 *     transaction.
 *
 * Callers from the app shell (`App.tsx`, StatusBar, file-menu handlers)
 * coordinate between this and the undo store: a successful save calls
 * `markClean()`, an `apply` that produces a history entry calls
 * `markDirty()`, and the three dialog setters are called as the file
 * path fires or fails.
 */
import { create } from 'zustand';

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

interface DocumentState {
  /** Absolute path of the open `.contexture.json`, or `null` for a new file. */
  filePath: string | null;
  /** True when the in-memory IR diverges from the last save. */
  isDirty: boolean;

  /** Non-empty while the import-warnings dialog is visible. */
  importWarnings: ImportWarning[];
  /** Non-null while the format-unknown dialog is visible. */
  unknownFormatPath: string | null;
  /** Non-null while the save-with-errors dialog is visible. */
  saveWithErrorsPrompt: SaveWithErrorsPrompt | null;

  setFilePath: (path: string | null) => void;
  markDirty: () => void;
  markClean: () => void;

  showImportWarnings: (warnings: ImportWarning[]) => void;
  clearImportWarnings: () => void;

  showUnknownFormat: (filePath: string) => void;
  clearUnknownFormat: () => void;

  showSaveWithErrors: (prompt: SaveWithErrorsPrompt) => void;
  clearSaveWithErrors: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  filePath: null,
  isDirty: false,
  importWarnings: [],
  unknownFormatPath: null,
  saveWithErrorsPrompt: null,

  setFilePath: (filePath) => set({ filePath }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  showImportWarnings: (importWarnings) => set({ importWarnings }),
  clearImportWarnings: () => set({ importWarnings: [] }),

  showUnknownFormat: (unknownFormatPath) => set({ unknownFormatPath }),
  clearUnknownFormat: () => set({ unknownFormatPath: null }),

  showSaveWithErrors: (saveWithErrorsPrompt) => set({ saveWithErrorsPrompt }),
  clearSaveWithErrors: () => set({ saveWithErrorsPrompt: null }),
}));
