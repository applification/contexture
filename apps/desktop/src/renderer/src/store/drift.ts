/**
 * `useDriftStore` — tracks generated files whose on-disk state no
 * longer matches the emitted manifest. Set by drift IPC events from the
 * main process; cleared by user dismissal or when Contexture re-writes
 * the files (bringing hashes back into agreement).
 */
import { create } from 'zustand';

export interface DriftFileStatus {
  path: string;
  status: 'drifted' | 'missing' | 'unreadable' | 'modified' | 'stale' | 'externally_regenerated';
}

interface DriftState {
  files: DriftFileStatus[];
  driftedPaths: string[];
  setDetected: (files: DriftFileStatus[]) => void;
  setDrifted: (paths: string[]) => void;
  setResolved: () => void;
  dismiss: () => void;
}

export const useDriftStore = create<DriftState>((set) => ({
  files: [],
  driftedPaths: [],
  setDetected: (files: DriftFileStatus[]) =>
    set({ files, driftedPaths: files.map((file) => file.path) }),
  setDrifted: (paths: string[]) =>
    set({
      files: paths.map((path) => ({ path, status: 'drifted' })),
      driftedPaths: paths,
    }),
  setResolved: () => set({ files: [], driftedPaths: [] }),
  dismiss: () => {
    set({ files: [], driftedPaths: [] });
    void window.contexture?.drift.dismiss();
  },
}));
