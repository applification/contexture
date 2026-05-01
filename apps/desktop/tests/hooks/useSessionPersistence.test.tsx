import {
  SESSION_KEY,
  type SessionStorage,
  useSessionPersistence,
} from '@renderer/hooks/useSessionPersistence';
import { useDocumentStore } from '@renderer/store/document';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeStorage(): SessionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Reset stores to clean state.
  useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  const d = useDocumentStore.getState();
  d.setFilePath(null);
  d.setMode('scratch');
  d.markClean();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useSessionPersistence', () => {
  it('restores unsaved schema from storage when schema is empty on mount', () => {
    const storage = makeStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        schema: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] },
        layout: { version: '1', positions: { Plot: { x: 10, y: 20 } } },
      }),
    );

    const onRestore = vi.fn();
    renderHook(() =>
      useSessionPersistence({
        getLayout: () => ({ version: '1', positions: {} }),
        onRestoreSession: onRestore,
        storage,
      }),
    );

    expect(useUndoStore.getState().schema.types).toHaveLength(1);
    expect(useUndoStore.getState().schema.types[0].name).toBe('Plot');
    expect(onRestore).toHaveBeenCalledWith({
      version: '1',
      positions: { Plot: { x: 10, y: 20 } },
    });
  });

  it('does not restore when schema already has types (another load was faster)', () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Existing', fields: [] },
    });

    const storage = makeStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        schema: { version: '1', types: [{ kind: 'object', name: 'SessionType', fields: [] }] },
        layout: { version: '1', positions: {} },
      }),
    );

    const onRestore = vi.fn();
    renderHook(() =>
      useSessionPersistence({
        getLayout: () => ({ version: '1', positions: {} }),
        onRestoreSession: onRestore,
        storage,
      }),
    );

    expect(useUndoStore.getState().schema.types[0].name).toBe('Existing');
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('does not restore when filePath is already set on mount', () => {
    useDocumentStore.getState().setFilePath('/tmp/already-open.contexture.json');

    const storage = makeStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        schema: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] },
        layout: { version: '1', positions: {} },
      }),
    );

    const onRestore = vi.fn();
    renderHook(() =>
      useSessionPersistence({
        getLayout: () => ({ version: '1', positions: {} }),
        onRestoreSession: onRestore,
        storage,
      }),
    );

    expect(useUndoStore.getState().schema.types).toHaveLength(0);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('saves schema to storage when schema changes and filePath is null', async () => {
    const storage = makeStorage();

    renderHook(() =>
      useSessionPersistence({
        getLayout: () => ({ version: '1', positions: { Plot: { x: 1, y: 2 } } }),
        onRestoreSession: vi.fn(),
        storage,
      }),
    );

    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const raw = storage.getItem(SESSION_KEY);
    expect(raw).not.toBeNull();
    const session = JSON.parse(raw ?? '');
    expect(session.schema.types[0].name).toBe('Plot');
    expect(session.layout.positions.Plot).toEqual({ x: 1, y: 2 });
  });

  it('does not save to storage when filePath is set (file handles persistence)', async () => {
    useDocumentStore.getState().setFilePath('/tmp/saved.contexture.json');

    const storage = makeStorage();

    renderHook(() =>
      useSessionPersistence({
        getLayout: () => ({ version: '1', positions: {} }),
        onRestoreSession: vi.fn(),
        storage,
      }),
    );

    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('clears storage when the schema becomes empty', async () => {
    const storage = makeStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        schema: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] },
        layout: { version: '1', positions: {} },
      }),
    );

    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });

    renderHook(() =>
      useSessionPersistence({
        getLayout: () => ({ version: '1', positions: {} }),
        onRestoreSession: vi.fn(),
        storage,
      }),
    );

    act(() => {
      useUndoStore
        .getState()
        .apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('clears storage when filePath becomes non-null (file opened or saved)', () => {
    const storage = makeStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        schema: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] },
        layout: { version: '1', positions: {} },
      }),
    );

    renderHook(() =>
      useSessionPersistence({
        getLayout: () => ({ version: '1', positions: {} }),
        onRestoreSession: vi.fn(),
        storage,
      }),
    );

    act(() => {
      useDocumentStore.getState().setFilePath('/tmp/newly-saved.contexture.json');
    });

    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('does not crash when storage write throws (e.g. private browsing quota)', async () => {
    const storage = makeStorage();
    storage.setItem = vi.fn().mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    const { unmount } = renderHook(() =>
      useSessionPersistence({
        getLayout: () => ({ version: '1', positions: {} }),
        onRestoreSession: vi.fn(),
        storage,
      }),
    );

    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // If we reach here without throwing, the test passes.
    // Explicitly unmount before afterEach to guarantee effect cleanup order.
    unmount();
  });

  it('handles corrupt storage data without crashing', () => {
    const storage = makeStorage();
    storage.setItem(SESSION_KEY, 'not valid json {{{{');

    const onRestore = vi.fn();
    expect(() =>
      renderHook(() =>
        useSessionPersistence({
          getLayout: () => ({ version: '1', positions: {} }),
          onRestoreSession: onRestore,
          storage,
        }),
      ),
    ).not.toThrow();

    expect(onRestore).not.toHaveBeenCalled();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });
});
