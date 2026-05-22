import { useModelChangeLogRecorder } from '@renderer/hooks/useModelChangeLogRecorder';
import { useChangesStore } from '@renderer/store/changes';
import { useDocumentStore } from '@renderer/store/document';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const irPath = '/tmp/garden.contexture.json';

function setupBridge() {
  const appendChange = vi.fn(
    async (payload: { irPath: string; source: string; opKind: string }) => ({
      ok: true,
      entry: {
        id: `change-${payload.opKind}`,
        irPath: payload.irPath,
        source: payload.source,
        reason: 'op_applied',
        opKind: payload.opKind,
        changedTypes: [],
        addedTypes: ['Plot'],
        removedTypes: [],
        renamedTypes: [],
        changeCount: 1,
        afterHash: 'hash',
        createdAt: '2026-05-22T07:00:00.000Z',
        summary: 'Added Plot',
      },
    }),
  );
  (window as unknown as { contexture: unknown }).contexture = {
    modelSync: {
      appendChange,
    },
  };
  return { appendChange };
}

beforeEach(() => {
  useUndoStore
    .getState()
    .apply({ kind: 'replace_schema', schema: { version: '1', types: [] } }, { log: false });
  useDocumentStore.setState({
    filePath: irPath,
    isDirty: false,
    mode: 'bundle',
    layout: { version: '1', positions: {} },
  });
  useChangesStore.setState({
    status: 'ready',
    entries: [],
    warnings: [],
    error: null,
    query: '',
    sourceFilter: 'all',
    currentSelectionOnly: false,
    selectedId: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useModelChangeLogRecorder', () => {
  it('appends a desktop change-log entry for renderer ops', () => {
    const { appendChange } = setupBridge();
    renderHook(() => useModelChangeLogRecorder());

    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });

    expect(appendChange).toHaveBeenCalledWith(
      expect.objectContaining({
        irPath,
        source: 'desktop',
        reason: 'op_applied',
        opKind: 'add_type',
      }),
    );
  });

  it('honors source metadata and log suppression', () => {
    const { appendChange } = setupBridge();
    renderHook(() => useModelChangeLogRecorder());

    act(() => {
      useUndoStore.getState().apply(
        {
          kind: 'add_type',
          type: { kind: 'object', name: 'AgentType', fields: [] },
        },
        { source: 'schema_agent' },
      );
      useUndoStore
        .getState()
        .apply({ kind: 'replace_schema', schema: { version: '1', types: [] } }, { log: false });
    });

    expect(appendChange).toHaveBeenCalledTimes(1);
    expect(appendChange).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'schema_agent',
        opKind: 'add_type',
      }),
    );
  });

  it('adds successful append results to the visible change store', async () => {
    setupBridge();
    renderHook(() => useModelChangeLogRecorder());

    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
    });

    await waitFor(() => {
      expect(useChangesStore.getState().entries).toEqual([
        expect.objectContaining({
          id: 'change-add_type',
          irPath,
          source: 'desktop',
          opKind: 'add_type',
        }),
      ]);
    });
  });
});
