import { ReconcileModal } from '@renderer/components/dialogs/ReconcileModal';
import { useDocumentStore } from '@renderer/store/document';
import { useDriftStore } from '@renderer/store/drift';
import { useReconcileStore } from '@renderer/store/reconcile';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pierre/diffs/react', () => ({
  MultiFileDiff: () => <div data-testid="reconcile-diff" />,
}));

vi.mock('@renderer/hooks/useSchemaAgentReconcile', () => ({
  useSchemaAgentReconcile: () => undefined,
}));

const IR_PATH = '/repo/packages/contexture/garden.contexture.json';
const ZOD_PATH = '/repo/packages/contexture/garden.schema.ts';
const UNKNOWN_PATH = '/repo/packages/contexture/custom.ts';
const USER_INDEX_PATH = '/repo/packages/contexture/src/index.ts';

const SCHEMA = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Plot',
      fields: [{ name: 'name', type: { kind: 'string' } }],
    },
  ],
} as const;

beforeEach(() => {
  useUndoStore.setState({
    schema: SCHEMA,
    past: [],
    future: [],
    txDepth: 0,
    txStart: null,
    canUndo: false,
    canRedo: false,
  });
  useDocumentStore.setState({ filePath: IR_PATH, mode: 'bundle' });
  useDriftStore.getState().setResolved();
  useReconcileStore.getState().reset();
  Object.defineProperty(window, 'contexture', {
    value: {
      drift: {
        check: vi.fn().mockResolvedValue({ ok: true }),
        dismiss: vi.fn().mockResolvedValue({ ok: true }),
      },
      reconcile: {
        writeGeneratedTarget: vi.fn().mockResolvedValue(undefined),
      },
    },
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useDriftStore.getState().setResolved();
  useReconcileStore.getState().reset();
});

describe('ReconcileModal', () => {
  it('regenerates a generated file from the current IR even when reconcile analysis failed', async () => {
    useDriftStore.getState().setDetected([{ path: ZOD_PATH, status: 'unreadable' }]);
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setError(`Cannot read ${ZOD_PATH}.`);

    render(<ReconcileModal />);

    fireEvent.click(screen.getByRole('button', { name: /regenerate from ir/i }));

    await waitFor(() =>
      expect(window.contexture?.reconcile.writeGeneratedTarget).toHaveBeenCalledOnce(),
    );
    const [payload] =
      vi.mocked(window.contexture?.reconcile.writeGeneratedTarget).mock.calls[0] ?? [];
    expect(payload).toMatchObject({ irPath: IR_PATH, targetPath: ZOD_PATH });
    const contents = payload?.contents ?? '';
    expect(contents).toContain('@contexture-generated');
    expect(contents).toContain('Plot');
    expect(window.contexture?.drift.check).toHaveBeenCalledOnce();
    expect(useReconcileStore.getState().isOpen).toBe(false);
  });

  it('does not offer regeneration for unknown or user-owned targets', () => {
    useReconcileStore.getState().open(UNKNOWN_PATH);
    useReconcileStore.getState().setReady([], 'user-owned source');

    render(<ReconcileModal />);

    expect(screen.getByRole('button', { name: /regenerate from ir/i })).toBeDisabled();
  });

  it('does not regenerate a user-owned nested index.ts even though it looks like a schema index', () => {
    useReconcileStore.getState().open(USER_INDEX_PATH);
    useReconcileStore.getState().setReady([], 'user-owned index');

    render(<ReconcileModal />);

    expect(screen.getByRole('button', { name: /regenerate from ir/i })).toBeDisabled();
  });

  it('leaves drift dirty when the user closes without regenerating', () => {
    useDriftStore.getState().setDetected([{ path: ZOD_PATH, status: 'drifted' }]);
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady([], 'hand edited source');

    render(<ReconcileModal />);
    fireEvent.click(screen.getByRole('button', { name: /leave dirty/i }));

    expect(window.contexture?.reconcile.writeGeneratedTarget).not.toHaveBeenCalled();
    expect(useDriftStore.getState().driftedPaths).toEqual([ZOD_PATH]);
    expect(useReconcileStore.getState().isOpen).toBe(false);
  });
});
