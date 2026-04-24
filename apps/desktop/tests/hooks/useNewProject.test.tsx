/**
 * `useNewProject` — subscribes to the File → New Project… menu and
 * flips `useNewProjectStore` open when it fires. Keeps the wiring in
 * one place so the dialog component can stay dumb. Tests drive the
 * subscription via a fake `window.contexture.file` surface.
 */
import { useNewProject } from '@renderer/hooks/useNewProject';
import { useNewProjectStore } from '@renderer/store/new-project';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function mockFileBridge(): { fire: () => void; unsubscribe: ReturnType<typeof vi.fn> } {
  let captured: (() => void) | null = null;
  const unsubscribe = vi.fn();
  (window as unknown as { contexture: unknown }).contexture = {
    chat: {},
    file: {
      openDialog: vi.fn(),
      saveAsDialog: vi.fn(),
      save: vi.fn(),
      read: vi.fn(),
      getRecentFiles: vi.fn(),
      openRecent: vi.fn(),
      onMenuNew: () => () => undefined,
      onMenuOpen: () => () => undefined,
      onMenuSave: () => () => undefined,
      onMenuSaveAs: () => () => undefined,
      onMenuNewProject: (listener: () => void) => {
        captured = listener;
        return unsubscribe;
      },
    },
  };
  return {
    fire: () => captured?.(),
    unsubscribe,
  };
}

beforeEach(() => {
  useNewProjectStore.getState().close();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useNewProject', () => {
  it('opens the dialog when the New Project menu fires', () => {
    const bridge = mockFileBridge();
    renderHook(() => useNewProject());
    expect(useNewProjectStore.getState().isOpen).toBe(false);
    act(() => {
      bridge.fire();
    });
    expect(useNewProjectStore.getState().isOpen).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const bridge = mockFileBridge();
    const { unmount } = renderHook(() => useNewProject());
    unmount();
    expect(bridge.unsubscribe).toHaveBeenCalled();
  });
});
