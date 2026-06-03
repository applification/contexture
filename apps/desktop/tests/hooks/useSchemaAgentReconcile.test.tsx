import { useSchemaAgentReconcile } from '@renderer/hooks/useSchemaAgentReconcile';
import { useDocumentStore } from '@renderer/store/document';
import { useDriftStore } from '@renderer/store/drift';
import { useReconcileStore } from '@renderer/store/reconcile';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const IR_PATH = '/repo/packages/contexture/garden.contexture.json';
const CONVEX_PATH = '/repo/packages/contexture/convex/schema.ts';
const CONVEX_RELATIONSHIPS_PATH = '/repo/packages/contexture/convex/relationships.ts';

const schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Post',
      table: true,
      fields: [{ name: 'title', type: { kind: 'string' } }],
    },
  ],
} as const;

beforeEach(() => {
  useDocumentStore.setState({ filePath: IR_PATH, mode: 'bundle' });
  useDriftStore.getState().setResolved();
  useReconcileStore.getState().reset();
  useUndoStore.setState({
    schema,
    past: [],
    future: [],
    txDepth: 0,
    txStart: null,
    canUndo: false,
    canRedo: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useDriftStore.getState().setResolved();
  useReconcileStore.getState().reset();
});

describe('useSchemaAgentReconcile', () => {
  it('validates proposal ops as an ordered sequence', async () => {
    (window as unknown as { contexture: unknown }).contexture = {
      reconcile: {
        readGeneratedTarget: vi.fn().mockResolvedValue('on disk source'),
        query: vi.fn().mockResolvedValue({
          ok: true,
          ops: [
            {
              op: {
                kind: 'add_field',
                typeName: 'Post',
                field: { name: 'published', type: { kind: 'boolean' } },
              },
              label: 'Add field published to Post',
              lossy: false,
              provenance: 'deterministic',
            },
            {
              op: {
                kind: 'add_index',
                typeName: 'Post',
                index: { name: 'by_published', fields: ['published'] },
              },
              label: 'Add index by_published to Post',
              lossy: false,
              provenance: 'deterministic',
            },
          ],
        }),
      },
    };
    useReconcileStore.getState().open(CONVEX_PATH);

    renderHook(() => useSchemaAgentReconcile());

    await waitFor(() => expect(useReconcileStore.getState().status).toBe('ready'));
    expect(useReconcileStore.getState().proposedOps.map((entry) => entry.op.kind)).toEqual([
      'add_field',
      'add_index',
    ]);
  });

  it('offers regeneration without proposal analysis when a generated file is missing', async () => {
    const query = vi.fn();
    (window as unknown as { contexture: unknown }).contexture = {
      reconcile: {
        readGeneratedTarget: vi.fn().mockResolvedValue(null),
        query,
      },
    };
    useDriftStore.getState().setDetected([{ path: CONVEX_RELATIONSHIPS_PATH, status: 'missing' }]);
    useReconcileStore.getState().open(CONVEX_RELATIONSHIPS_PATH);

    renderHook(() => useSchemaAgentReconcile());

    await waitFor(() => expect(useReconcileStore.getState().status).toBe('ready'));
    expect(useReconcileStore.getState().proposedOps).toEqual([]);
    expect(useReconcileStore.getState().onDiskSource).toBe('');
    expect(query).not.toHaveBeenCalled();
  });
});
