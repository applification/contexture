import { create } from 'zustand';
import type { Ontology } from '../model/types';
import { useOntologyStore } from './ontology';

const MAX_HISTORY = 50;

interface HistoryState {
  past: Ontology[];
  canUndo: boolean;
  undo: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  canUndo: false,

  undo: () => {
    const { past } = get();
    if (past.length === 0) return;
    const snapshot = past[past.length - 1];
    set({ past: past.slice(0, -1), canUndo: past.length > 1 });
    skipNextSnapshot = true;
    useOntologyStore.getState().restoreOntology(snapshot);
  },
}));

// Skip snapshotting the state change caused by undo itself
let skipNextSnapshot = false;

useOntologyStore.subscribe((state, prevState) => {
  if (state.ontology === prevState.ontology) return;

  // Clear history on file load / reset (isDirty is always false after these)
  if (!state.isDirty) {
    useHistoryStore.setState({ past: [], canUndo: false });
    return;
  }

  // Skip snapshotting undo operations
  if (skipNextSnapshot) {
    skipNextSnapshot = false;
    return;
  }

  const snapshot = prevState.ontology;
  useHistoryStore.setState((s) => {
    const newPast = [...s.past.slice(-(MAX_HISTORY - 1)), snapshot];
    return { past: newPast, canUndo: newPast.length > 0 };
  });
});
