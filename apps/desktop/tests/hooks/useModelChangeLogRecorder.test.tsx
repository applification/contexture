import { useModelChangeLogRecorder } from '@renderer/hooks/useModelChangeLogRecorder';
import { useDocumentStore } from '@renderer/store/document';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const irPath = '/tmp/garden.contexture.json';

function setupBridge() {
  const appendChange = vi.fn(async () => ({ ok: true }));
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
});
