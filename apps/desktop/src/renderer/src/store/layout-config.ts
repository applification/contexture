/**
 * Graph layout configuration store.
 *
 * Holds ELK tuning knobs exposed by the GraphControls panel. Persisted
 * to the layout sidecar alongside node positions — loading a document
 * hydrates this store, and subsequent mutations are written back.
 */
import { create } from 'zustand';

export interface GraphLayout {
  nodeSpacing: number;
}

export const DEFAULT_LAYOUT: GraphLayout = {
  nodeSpacing: 180,
};

interface GraphLayoutStoreShape {
  graphLayout: GraphLayout;
  setGraphLayout(patch: Partial<GraphLayout>): void;
  resetToDefaults(): void;
}

export const useGraphLayoutStore = create<GraphLayoutStoreShape>((set) => ({
  graphLayout: { ...DEFAULT_LAYOUT },
  setGraphLayout: (patch) => set((s) => ({ graphLayout: { ...s.graphLayout, ...patch } })),
  resetToDefaults: () => set({ graphLayout: { ...DEFAULT_LAYOUT } }),
}));
