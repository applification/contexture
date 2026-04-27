/**
 * `useDriftStore` — tracks whether the Convex schema file has been
 * hand-edited outside Contexture. Set by drift IPC events from the
 * main process; cleared by user dismissal or when Contexture re-writes
 * the file (bringing hashes back into agreement).
 */
import { create } from 'zustand';

interface DriftState {
  isDrifted: boolean;
  setDrifted: () => void;
  setResolved: () => void;
  dismiss: () => void;
}

export const useDriftStore = create<DriftState>((set) => ({
  isDrifted: false,
  setDrifted: () => set({ isDrifted: true }),
  setResolved: () => set({ isDrifted: false }),
  dismiss: () => {
    set({ isDrifted: false });
    void window.contexture?.drift.dismiss();
  },
}));
