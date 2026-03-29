import { create } from 'zustand';

type Theme = 'dark' | 'light';

export interface GraphFilters {
  showSubClassOf: boolean;
  showDisjointWith: boolean;
  showObjectProperties: boolean;
  showDatatypeProperties: boolean;
  minDegree: number;
}

export interface GraphLayout {
  nodeSpacing: number;
}

const DEFAULT_FILTERS: GraphFilters = {
  showSubClassOf: true,
  showDisjointWith: true,
  showObjectProperties: true,
  showDatatypeProperties: true,
  minDegree: 0,
};

const DEFAULT_LAYOUT: GraphLayout = {
  nodeSpacing: 180,
};

export type SidebarTab = 'properties' | 'chat' | 'eval' | 'metrics';

interface UIState {
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  adjacentNodeIds: string[];
  adjacentEdgeIds: string[];
  theme: Theme;
  chatOpen: boolean;
  sidebarVisible: boolean;
  graphFilters: GraphFilters;
  graphLayout: GraphLayout;
  focusNodeId: string | null;
  sidebarTab: SidebarTab;
  chatDraft: string;

  setSelectedNode: (id: string | null) => void;
  toggleSelectedNode: (id: string) => void;
  clearMultiSelect: () => void;
  setSelectedEdge: (id: string | null) => void;
  setAdjacency: (nodeIds: string[], edgeIds: string[]) => void;
  toggleTheme: () => void;
  setChatOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setGraphFilter: (patch: Partial<GraphFilters>) => void;
  setGraphLayout: (patch: Partial<GraphLayout>) => void;
  resetGraphControls: () => void;
  setFocusNode: (id: string | null) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setChatDraft: (draft: string) => void;
  pendingChatMessage: { message: string; context: string } | null;
  setPendingChatMessage: (msg: { message: string; context: string } | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedNodeId: null,
  selectedNodeIds: [],
  selectedEdgeId: null,
  adjacentNodeIds: [],
  adjacentEdgeIds: [],
  theme: 'dark',
  chatOpen: true,
  sidebarVisible: true,
  graphFilters: { ...DEFAULT_FILTERS },
  graphLayout: { ...DEFAULT_LAYOUT },
  focusNodeId: null,
  sidebarTab: 'chat',
  chatDraft: '',
  pendingChatMessage: null,

  setSelectedNode: (id) => set({ selectedNodeId: id, selectedNodeIds: id ? [id] : [] }),
  toggleSelectedNode: (id) =>
    set((s) => {
      const ids = s.selectedNodeIds.includes(id)
        ? s.selectedNodeIds.filter((x) => x !== id)
        : [...s.selectedNodeIds, id];
      return { selectedNodeIds: ids, selectedNodeId: ids.length > 0 ? ids[ids.length - 1] : null };
    }),
  clearMultiSelect: () => set({ selectedNodeIds: [], selectedNodeId: null }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id }),
  setAdjacency: (nodeIds, edgeIds) => set({ adjacentNodeIds: nodeIds, adjacentEdgeIds: edgeIds }),
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      return { theme: newTheme };
    }),
  setChatOpen: (open) => set({ chatOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setGraphFilter: (patch) => set((s) => ({ graphFilters: { ...s.graphFilters, ...patch } })),
  setGraphLayout: (patch) => set((s) => ({ graphLayout: { ...s.graphLayout, ...patch } })),
  resetGraphControls: () =>
    set({ graphFilters: { ...DEFAULT_FILTERS }, graphLayout: { ...DEFAULT_LAYOUT } }),
  setFocusNode: (id) => set({ focusNodeId: id }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setChatDraft: (draft) => set({ chatDraft: draft }),
  setPendingChatMessage: (msg) => set({ pendingChatMessage: msg }),
}));
