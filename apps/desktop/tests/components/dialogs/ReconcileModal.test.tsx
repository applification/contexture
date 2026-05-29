import { emitGeneratedTarget } from '@contexture/core/generated-targets';
import { useChatThreadStore } from '@renderer/chat/useChatThreads';
import { ReconcileModal } from '@renderer/components/dialogs/ReconcileModal';
import { useDocumentStore } from '@renderer/store/document';
import { useDriftStore } from '@renderer/store/drift';
import { useReconcileStore } from '@renderer/store/reconcile';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pierre/diffs/react', () => ({
  MultiFileDiff: ({
    oldFile,
    newFile,
  }: {
    oldFile: { contents: string };
    newFile: { contents: string };
  }) => (
    <div data-testid="reconcile-diff">
      <div data-testid="reconcile-diff-old">{oldFile.contents}</div>
      <div data-testid="reconcile-diff-new">{newFile.contents}</div>
    </div>
  ),
}));

vi.mock('@renderer/hooks/useSchemaAgentReconcile', () => ({
  useSchemaAgentReconcile: () => undefined,
}));

const IR_PATH = '/repo/packages/contexture/garden.contexture.json';
const ZOD_PATH = '/repo/packages/contexture/garden.schema.ts';
const CONVEX_PATH = '/repo/packages/contexture/convex/schema.ts';
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
  localStorage.clear();
  useChatThreadStore.getState().reloadFromStorage();
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
  useDocumentStore.getState().resetLayout();
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
        acceptGeneratedTarget: vi.fn().mockResolvedValue(undefined),
        validateConvexGeneratedTarget: vi.fn().mockResolvedValue({ status: 'skipped' }),
      },
      shell: {
        openInEditor: vi.fn().mockResolvedValue(undefined),
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

  it('explains stale generated files as current-IR re-emit work', () => {
    useDriftStore.getState().setDetected([{ path: ZOD_PATH, status: 'stale' }]);
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady([], 'old generated source');

    render(<ReconcileModal />);

    expect(
      screen.getByText(/still matches the last manifest, but not the current IR/i),
    ).toBeVisible();
  });

  it('explains externally regenerated files as manifest work', () => {
    useDriftStore.getState().setDetected([{ path: ZOD_PATH, status: 'externally_regenerated' }]);
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady([], 'current generated source');

    render(<ReconcileModal />);

    expect(
      screen.getByText(/already matches the current IR, but the manifest is out of date/i),
    ).toBeVisible();
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

  it('opens the generated file from the reconcile modal', () => {
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady([], 'hand edited source');

    render(<ReconcileModal />);
    fireEvent.click(screen.getByRole('button', { name: /open file/i }));

    expect(window.contexture?.shell.openInEditor).toHaveBeenCalledWith(ZOD_PATH);
  });

  it('opens on file changes and explains the uncovered changes view', async () => {
    const projectedSchema = {
      ...SCHEMA,
      types: [
        {
          ...SCHEMA.types[0],
          fields: [...SCHEMA.types[0].fields, { name: 'title', type: { kind: 'string' } }],
        },
      ],
    } as const;
    const onDiskSource = emitGeneratedTarget(projectedSchema, 'zod', IR_PATH);
    useDriftStore.getState().setDetected([{ path: ZOD_PATH, status: 'modified' }]);
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady(
      [
        {
          id: 'add-title',
          label: 'Add field title to Plot',
          lossy: false,
          provenance: 'deterministic',
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'title', type: { kind: 'string' } },
          },
        },
      ],
      onDiskSource,
    );

    render(<ReconcileModal />);

    expect(screen.getByText('Generated file change')).toBeVisible();
    expect(screen.getByText(/Current Contexture emit to on-disk/)).toBeVisible();
    expect(screen.getByText('Proposed model ops')).toBeVisible();
    expect(screen.getByText(/1 selected of 1/i)).toBeVisible();
    expect(screen.getByTestId('reconcile-diff-new')).toHaveTextContent('title');

    fireEvent.click(screen.getByRole('tab', { name: /uncovered changes/i }));

    await waitFor(() => expect(screen.getByText('Uncovered after selected ops')).toBeVisible());
    expect(screen.getByText(/0 uncovered lines/i)).toBeVisible();
    expect(screen.getByText(/selected ops fully explain/i)).toBeVisible();
    expect(screen.getByText(/selected ops reproduce the on-disk generated file/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /apply selected ops/i })).toBeEnabled();
  });

  it('closes after regenerating a configured Convex target without running CLI validation implicitly', async () => {
    useDriftStore.getState().setDetected([{ path: CONVEX_PATH, status: 'modified' }]);
    useReconcileStore.getState().open(CONVEX_PATH);
    useReconcileStore.getState().setReady([], 'hand edited source');

    render(<ReconcileModal />);
    fireEvent.click(screen.getByRole('button', { name: /regenerate from ir/i }));

    await waitFor(() => expect(useReconcileStore.getState().isOpen).toBe(false));
    expect(window.contexture?.reconcile.validateConvexGeneratedTarget).not.toHaveBeenCalled();
  });

  it('writes the reconciled generated target before closing accepted proposals', async () => {
    useDriftStore.getState().setDetected([{ path: ZOD_PATH, status: 'modified' }]);
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady(
      [
        {
          id: 'add-field',
          label: 'Add field title to Plot',
          lossy: false,
          provenance: 'deterministic',
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'title', type: { kind: 'string' } },
          },
        },
      ],
      'hand edited source',
    );

    render(<ReconcileModal />);
    fireEvent.click(screen.getByRole('button', { name: /apply selected/i }));

    await waitFor(() =>
      expect(window.contexture?.reconcile.acceptGeneratedTarget).toHaveBeenCalledOnce(),
    );
    const [payload] =
      vi.mocked(window.contexture?.reconcile.acceptGeneratedTarget).mock.calls[0] ?? [];
    expect(payload).toMatchObject({ irPath: IR_PATH, targetPath: ZOD_PATH });
    expect(payload?.contents).toContain('title');
    expect(JSON.stringify(payload?.schema)).toContain('title');
    expect(useDriftStore.getState().driftedPaths).toEqual([ZOD_PATH]);
    expect(window.contexture?.drift.dismiss).not.toHaveBeenCalled();
    expect(window.contexture?.drift.check).toHaveBeenCalledOnce();
    expect(useReconcileStore.getState().isOpen).toBe(false);
  });

  it('shows proposal provenance for deterministic and assistant-backed ops', () => {
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady(
      [
        {
          id: 'deterministic-op',
          label: 'Add field title to Plot',
          lossy: false,
          provenance: 'deterministic',
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'title', type: { kind: 'string' } },
          },
        },
        {
          id: 'provider-op',
          label: 'Add field body to Plot',
          lossy: false,
          provenance: 'provider',
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'body', type: { kind: 'string' } },
          },
        },
      ],
      'hand edited source',
    );

    render(<ReconcileModal />);

    expect(screen.getByText('Deterministic')).toBeVisible();
    expect(screen.getByText('Assistant')).toBeVisible();
  });

  it('explains when Convex reverse-mapping used assistant fallback', () => {
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady(
      [
        {
          id: 'provider-op',
          label: 'Add field body to Plot',
          lossy: false,
          provenance: 'provider',
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'body', type: { kind: 'string' } },
          },
        },
      ],
      'hand edited source',
      {
        deterministicFallbackReason: 'Only `.index(...)` chains are supported on tables.',
      },
    );

    render(<ReconcileModal />);

    expect(screen.getByText(/could not safely reverse-map this Convex file/i)).toBeVisible();
    expect(screen.getByText(/chains are supported on tables/i)).toBeVisible();
    expect(screen.getByText(/Assistant fallback proposed the ops below/i)).toBeVisible();
  });

  it('rolls back accepted IR proposals when writing the reconciled target fails', async () => {
    vi.mocked(window.contexture?.reconcile.acceptGeneratedTarget).mockRejectedValueOnce(
      new Error('disk full'),
    );
    useDriftStore.getState().setDetected([{ path: ZOD_PATH, status: 'modified' }]);
    useReconcileStore.getState().open(ZOD_PATH);
    useReconcileStore.getState().setReady(
      [
        {
          id: 'add-field',
          label: 'Add field title to Plot',
          lossy: false,
          provenance: 'deterministic',
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'title', type: { kind: 'string' } },
          },
        },
      ],
      'hand edited source',
    );

    render(<ReconcileModal />);
    fireEvent.click(screen.getByRole('button', { name: /apply selected/i }));

    await screen.findByText(/failed to accept reconciled generated file: disk full/i);
    expect(useUndoStore.getState().schema).toEqual(SCHEMA);
    expect(window.contexture?.drift.check).not.toHaveBeenCalled();
    expect(useReconcileStore.getState().isOpen).toBe(true);
  });
});
