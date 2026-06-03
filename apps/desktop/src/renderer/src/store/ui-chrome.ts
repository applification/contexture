/**
 * UI chrome store — theme, sidebar, and active sidebar tab.
 *
 * Ephemeral window-local state; never touches the sidecar. Split out of
 * the graph selection store so components that only care about e.g. the
 * sidebar tab don't re-render on unrelated selection changes.
 */
import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';
export type SidebarTab =
  | 'properties'
  | 'chat'
  | 'review'
  | 'schema'
  | 'playground'
  | 'stdlib'
  | 'changes';

const THEME_STORAGE_KEY = 'theme';

interface UIChromeStoreShape {
  theme: ThemePreference;
  resolvedTheme: Theme;
  chatOpen: boolean;
  sidebarVisible: boolean;
  sidebarTab: SidebarTab;

  setTheme(theme: ThemePreference): void;
  toggleTheme(): void;
  setChatOpen(open: boolean): void;
  toggleSidebar(): void;
  setSidebarVisible(visible: boolean): void;
  setSidebarTab(tab: SidebarTab): void;
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function storedThemePreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system';
}

function resolveTheme(theme: ThemePreference): Theme {
  return theme === 'system' ? systemTheme() : theme;
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function persistTheme(theme: ThemePreference): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

const initialTheme = storedThemePreference();
const initialResolvedTheme = resolveTheme(initialTheme);
applyTheme(initialResolvedTheme);

export const useUIChromeStore = create<UIChromeStoreShape>((set) => ({
  theme: initialTheme,
  resolvedTheme: initialResolvedTheme,
  chatOpen: true,
  sidebarVisible: true,
  sidebarTab: 'chat',

  setTheme: (theme) => {
    const resolvedTheme = resolveTheme(theme);
    persistTheme(theme);
    applyTheme(resolvedTheme);
    set({ theme, resolvedTheme });
  },
  toggleTheme: () =>
    set((state) => {
      const theme: Theme = state.resolvedTheme === 'dark' ? 'light' : 'dark';
      persistTheme(theme);
      applyTheme(theme);
      return { theme, resolvedTheme: theme };
    }),
  setChatOpen: (open) => set({ chatOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
}));

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    const state = useUIChromeStore.getState();
    if (state.theme !== 'system') return;
    const resolvedTheme = event.matches ? 'dark' : 'light';
    applyTheme(resolvedTheme);
    useUIChromeStore.setState({ resolvedTheme });
  });
}
