/**
 * Wires cmd/ctrl+Z and cmd/ctrl+shift+Z to the undoable Contexture store.
 *
 * The hook installs a `keydown` listener on `window` for the lifetime of
 * the owning component. It intentionally does not scope to any specific
 * element — undo/redo should work regardless of which part of the app has
 * focus, matching the platform convention.
 *
 * Menu item wiring (the Electron menu calls `store.undo()` / `store.redo()`
 * directly) lives in the main process; this hook is the renderer-side half.
 */
import { useEffect } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { UndoableState } from '../store/undo';

export function useUndoHotkeys(store: UseBoundStore<StoreApi<UndoableState>>): void {
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() !== 'z') return;
      if (!(ev.metaKey || ev.ctrlKey)) return;
      ev.preventDefault();
      if (ev.shiftKey) store.getState().redo();
      else store.getState().undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store]);
}
