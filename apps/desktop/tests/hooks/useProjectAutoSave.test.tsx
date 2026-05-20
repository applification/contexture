/**
 * `useProjectAutoSave` — schema edits flush to disk 500ms after the last
 * change once the document has a file path.
 */
import { useProjectAutoSave } from '@renderer/hooks/useProjectAutoSave';
import { useDocumentStore } from '@renderer/store/document';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function mockFileBridge(): { save: ReturnType<typeof vi.fn> } {
  const save = vi.fn(async () => undefined);
  (window as unknown as { contexture: unknown }).contexture = {
    file: {
      save,
      openDialog: vi.fn(),
      saveAsDialog: vi.fn(),
      read: vi.fn(),
      getRecentFiles: vi.fn(),
      openRecent: vi.fn(),
      onMenuNew: () => () => undefined,
      onMenuOpen: () => () => undefined,
      onMenuSave: () => () => undefined,
      onMenuSaveAs: () => () => undefined,
      pickDirectory: vi.fn(async () => null),
    },
  };
  return { save };
}

beforeEach(() => {
  vi.useFakeTimers();
  useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  const d = useDocumentStore.getState();
  d.setFilePath(null);
  d.setMode('bundle');
  d.resetLayout();
  d.markClean();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useProjectAutoSave', () => {
  it('does nothing without a file path', () => {
    const { save } = mockFileBridge();
    renderHook(() => useProjectAutoSave());
    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('saves 500ms after a schema change when a file path is set', async () => {
    const { save } = mockFileBridge();
    useDocumentStore.getState().setFilePath('/tmp/a.contexture.json');
    useDocumentStore.getState().setMode('bundle');
    renderHook(() => useProjectAutoSave());
    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ irPath: '/tmp/a.contexture.json' }),
    );
  });

  it('debounces — multiple rapid edits coalesce into one save', async () => {
    const { save } = mockFileBridge();
    useDocumentStore.getState().setFilePath('/tmp/a.contexture.json');
    useDocumentStore.getState().setMode('bundle');
    renderHook(() => useProjectAutoSave());
    for (let i = 0; i < 3; i++) {
      act(() => {
        useUndoStore.getState().apply({
          kind: 'add_type',
          type: { kind: 'object', name: `T${i}`, fields: [] },
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
    // Only 300ms of "quiet time" passed so far — not enough.
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not save when filePath is null even in bundle mode', async () => {
    const { save } = mockFileBridge();
    useDocumentStore.getState().setFilePath(null);
    useDocumentStore.getState().setMode('bundle');
    renderHook(() => useProjectAutoSave());
    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('passes document layout and the current chat through autosave', async () => {
    const { save } = mockFileBridge();
    useDocumentStore.getState().setFilePath('/tmp/a.contexture.json');
    useDocumentStore.getState().setMode('bundle');
    const layout = { version: '1' as const, positions: { Plot: { x: 1, y: 2 } } };
    useDocumentStore.getState().setLayout(layout);
    const chat = {
      version: '1' as const,
      messages: [{ id: 'm', role: 'user' as const, content: 'hi', createdAt: 1 }],
    };
    renderHook(() =>
      useProjectAutoSave({
        getChat: () => chat,
      }),
    );
    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ layout, chat }));
  });
});
