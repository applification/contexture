import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MatchMediaListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(matches: boolean): {
  setMatches: (matches: boolean) => void;
  emitChange: () => void;
} {
  let currentMatches = matches;
  const listeners = new Set<MatchMediaListener>();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: currentMatches,
      media: query,
      onchange: null,
      addEventListener: (_type: 'change', listener: MatchMediaListener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: 'change', listener: MatchMediaListener) => {
        listeners.delete(listener);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  return {
    setMatches: (matches) => {
      currentMatches = matches;
    },
    emitChange: () => {
      for (const listener of listeners) {
        listener({ matches: currentMatches } as MediaQueryListEvent);
      }
    },
  };
}

async function loadStore() {
  vi.resetModules();
  return import('@renderer/store/ui-chrome');
}

describe('UI chrome theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the system light theme on first startup', async () => {
    installMatchMedia(false);

    const { useUIChromeStore } = await loadStore();

    expect(useUIChromeStore.getState().theme).toBe('system');
    expect(useUIChromeStore.getState().resolvedTheme).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('uses the system dark theme on first startup', async () => {
    installMatchMedia(true);

    const { useUIChromeStore } = await loadStore();

    expect(useUIChromeStore.getState().theme).toBe('system');
    expect(useUIChromeStore.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('persists explicit light and dark choices', async () => {
    installMatchMedia(true);
    const { useUIChromeStore } = await loadStore();

    useUIChromeStore.getState().setTheme('light');

    expect(localStorage.getItem('theme')).toBe('light');
    expect(useUIChromeStore.getState().resolvedTheme).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('tracks system changes while system is selected', async () => {
    const matchMedia = installMatchMedia(false);
    const { useUIChromeStore } = await loadStore();

    matchMedia.setMatches(true);
    matchMedia.emitChange();

    expect(useUIChromeStore.getState().theme).toBe('system');
    expect(useUIChromeStore.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});
