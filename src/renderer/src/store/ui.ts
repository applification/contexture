import { create } from 'zustand'

type Theme = 'dark' | 'light'

export interface GraphFilters {
  showSubClassOf: boolean
  showDisjointWith: boolean
  showObjectProperties: boolean
  showDatatypeProperties: boolean
  minDegree: number
}

export interface GraphLayout {
  nodeSpacing: number
}

const DEFAULT_FILTERS: GraphFilters = {
  showSubClassOf: true,
  showDisjointWith: true,
  showObjectProperties: true,
  showDatatypeProperties: true,
  minDegree: 0
}

const DEFAULT_LAYOUT: GraphLayout = {
  nodeSpacing: 180
}

interface UIState {
  selectedNodeId: string | null
  selectedEdgeId: string | null
  theme: Theme
  chatOpen: boolean
  sidebarVisible: boolean
  graphFilters: GraphFilters
  graphLayout: GraphLayout
  focusNodeId: string | null

  setSelectedNode: (id: string | null) => void
  setSelectedEdge: (id: string | null) => void
  toggleTheme: () => void
  setChatOpen: (open: boolean) => void
  toggleSidebar: () => void
  setGraphFilter: (patch: Partial<GraphFilters>) => void
  setGraphLayout: (patch: Partial<GraphLayout>) => void
  resetGraphControls: () => void
  setFocusNode: (id: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  theme: 'dark',
  chatOpen: true,
  sidebarVisible: true,
  graphFilters: { ...DEFAULT_FILTERS },
  graphLayout: { ...DEFAULT_LAYOUT },
  focusNodeId: null,

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id }),
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', newTheme === 'dark')
      return { theme: newTheme }
    }),
  setChatOpen: (open) => set({ chatOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setGraphFilter: (patch) => set((s) => ({ graphFilters: { ...s.graphFilters, ...patch } })),
  setGraphLayout: (patch) => set((s) => ({ graphLayout: { ...s.graphLayout, ...patch } })),
  resetGraphControls: () => set({ graphFilters: { ...DEFAULT_FILTERS }, graphLayout: { ...DEFAULT_LAYOUT } }),
  setFocusNode: (id) => set({ focusNodeId: id })
}))
