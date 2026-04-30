/**
 * `useDriftStore` — tracks which generated files have been hand-edited
 * outside Contexture. Set by drift IPC events from the main process;
 * cleared by user dismissal or when Contexture re-writes the files
 * (bringing hashes back into agreement).
 */
import { create } from 'zustand';

interface DriftState {
  driftedPaths: string[];
  setDrifted: (paths: string[]) => void;
  setResolved: () => void;
  dismiss: () => void;
}

export const useDriftStore = create<DriftState>((set) => ({
  driftedPaths: [],
  setDrifted: (paths: string[]) => set({ driftedPaths: paths }),
  setResolved: () => set({ driftedPaths: [] }),
  dismiss: () => {
    set({ driftedPaths: [] });
    void window.contexture?.drift.dismiss();
  },
}));
