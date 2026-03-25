import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface UIState {
  selectedNodeId: string | null
  selectedEdgeId: string | null
  theme: Theme
  chatOpen: boolean

  setSelectedNode: (id: string | null) => void
  setSelectedEdge: (id: string | null) => void
  toggleTheme: () => void
  setChatOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  theme: 'dark',
  chatOpen: true,

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id }),
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', newTheme === 'dark')
      return { theme: newTheme }
    }),
  setChatOpen: (open) => set({ chatOpen: open })
}))
