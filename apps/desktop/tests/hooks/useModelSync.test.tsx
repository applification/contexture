import { type Schema, save } from '@contexture/core';
import { useModelSync } from '@renderer/hooks/useModelSync';
import { useDocumentStore } from '@renderer/store/document';
import { useModelSyncStore } from '@renderer/store/model-sync';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const irPath = '/tmp/garden.contexture.json';

const initial: Schema = { version: '1', types: [] };
const external: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Plot', fields: [] }],
};

function setupBridge() {
  let listener: ((payload: unknown) => void) | null = null;
  const watch = vi.fn(async () => ({ ok: true }));
  const unwatch = vi.fn(async () => ({ ok: true }));
  (window as unknown as { contexture: unknown }).contexture = {
    modelSync: {
      watch,
      unwatch,
      check: vi.fn(async () => ({ ok: true })),
      acknowledgeSelfWrite: vi.fn(async () => ({ ok: true })),
      getChangeLog: vi.fn(async () => ({ log: { version: '1', entries: [] }, warnings: [] })),
      onEvent: (fn: (payload: unknown) => void) => {
        listener = fn;
        return () => {
          listener = null;
        };
      },
    },
  };
  return {
    watch,
    emit(payload: unknown) {
      listener?.(payload);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useUndoStore.getState().apply({ kind: 'replace_schema', schema: initial });
  useDocumentStore.setState({
    filePath: irPath,
    isDirty: false,
    mode: 'bundle',
    layout: { version: '1', positions: {} },
  });
  useModelSyncStore.getState().clearAttention();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useModelSync', () => {
  it('starts watching the open IR path', () => {
    const bridge = setupBridge();

    renderHook(() => useModelSync());

    expect(bridge.watch).toHaveBeenCalledWith({ irPath });
  });

  it('auto-applies clean valid external changes', () => {
    const bridge = setupBridge();
    renderHook(() => useModelSync());

    act(() => {
      bridge.emit({
        irPath,
        status: 'changed',
        source: 'mcp',
        observedAt: 1,
        revision: 'rev',
        content: `${save(external)}\n`,
        schema: external,
      });
    });

    expect(useUndoStore.getState().schema).toEqual(external);
    expect(useDocumentStore.getState().isDirty).toBe(false);
    expect(useModelSyncStore.getState()).toMatchObject({
      status: 'synced',
      highlightedNodeIds: ['Plot'],
    });
  });

  it('queues valid external changes while the local model is dirty', () => {
    const bridge = setupBridge();
    useDocumentStore.getState().markDirty();
    renderHook(() => useModelSync());

    act(() => {
      bridge.emit({
        irPath,
        status: 'changed',
        source: 'cli',
        observedAt: 1,
        revision: 'rev',
        content: `${save(external)}\n`,
        schema: external,
      });
    });

    expect(useUndoStore.getState().schema).toEqual(initial);
    expect(useModelSyncStore.getState().status).toBe('external_changes');
    expect(useModelSyncStore.getState().pendingEvent).toMatchObject({ source: 'cli' });
  });

  it('keeps the last valid model visible for invalid source changes', () => {
    const bridge = setupBridge();
    renderHook(() => useModelSync());

    act(() => {
      bridge.emit({
        irPath,
        status: 'invalid_json',
        source: 'external',
        observedAt: 1,
        revision: 'bad',
        error: 'Invalid JSON',
      });
    });

    expect(useUndoStore.getState().schema).toEqual(initial);
    expect(useModelSyncStore.getState().status).toBe('invalid_model');
  });
});
