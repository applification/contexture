/**
 * Graph layout configuration store.
 *
 * Holds graph view/layout controls exposed by the GraphControls panel.
 * Persisted to the layout sidecar alongside node positions — loading a
 * document hydrates this store, and subsequent mutations are written back.
 */
import { create } from 'zustand';

export interface GraphLayout {
  layoutMode: 'organic' | 'layered';
  nodeSpacing: number;
  showEnums: boolean;
  showEdgeLabels: boolean;
}

export const DEFAULT_LAYOUT: GraphLayout = {
  layoutMode: 'layered',
  nodeSpacing: 180,
  showEnums: false,
  showEdgeLabels: true,
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
