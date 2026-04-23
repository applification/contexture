/**
 * UI chrome store — theme, sidebar, and active sidebar tab.
 *
 * Ephemeral window-local state; never touches the sidecar. Split out of
 * the old `useUIStore` so that components which only care about e.g.
 * the sidebar tab don't re-render on unrelated selection changes.
 */
import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type SidebarTab = 'properties' | 'chat' | 'schema' | 'eval' | 'metrics';

interface UIChromeStoreShape {
  theme: Theme;
  chatOpen: boolean;
  sidebarVisible: boolean;
  sidebarTab: SidebarTab;

  toggleTheme(): void;
  setChatOpen(open: boolean): void;
  toggleSidebar(): void;
  setSidebarVisible(visible: boolean): void;
  setSidebarTab(tab: SidebarTab): void;
}

export const useUIChromeStore = create<UIChromeStoreShape>((set) => ({
  theme: 'dark',
  chatOpen: true,
  sidebarVisible: true,
  sidebarTab: 'chat',

  toggleTheme: () =>
    set((state) => {
      const newTheme: Theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      return { theme: newTheme };
    }),
  setChatOpen: (open) => set({ chatOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
}));
