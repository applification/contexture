/**
 * Document-level state — the path and dirty flag for the open
 * `.contexture.json` file.
 *
 * Kept separate from the IR (`useUndoStore`) and UI (`useUIStore`)
 * stores because it has different lifetimes:
 *   - The IR changes on every op; the path only changes on open/save-as.
 *   - The dirty flag flips on any `apply` / `undo` / `redo` that lands
 *     outside an open transaction.
 *
 * Callers from the app shell (`App.tsx`, StatusBar, file-menu handlers)
 * coordinate between this and the undo store: a successful save calls
 * `markClean()`, an `apply` that produces a history entry calls
 * `markDirty()`.
 */
import { create } from 'zustand';

interface DocumentState {
  /** Absolute path of the open `.contexture.json`, or `null` for a new file. */
  filePath: string | null;
  /** True when the in-memory IR diverges from the last save. */
  isDirty: boolean;
  setFilePath: (path: string | null) => void;
  markDirty: () => void;
  markClean: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  filePath: null,
  isDirty: false,
  setFilePath: (filePath) => set({ filePath }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
}));
