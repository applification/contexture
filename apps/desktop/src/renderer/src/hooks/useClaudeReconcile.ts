/**
 * `useClaudeReconcile` — fires the one-shot Claude reconcile query
 * when the modal opens and feeds the result into the reconcile store.
 *
 * Sequence:
 *   1. Read the on-disk source for the target path via the legacy preload
 *      helper `window.api.readFileSilent` (already wired to Node fs).
 *   2. Snapshot the current IR from the undo store.
 *   3. Derive the target kind from the file path.
 *   4. Round-trip via `window.contexture.reconcile.query`.
 *   5. Validate each returned op by attempting to apply it to a copy
 *      of the schema — invalid entries are dropped with a console
 *      warning rather than failing the whole load.
 *   6. Push the surviving ops into the reconcile store.
 *
 * Drops state updates after the modal closes (re-mounts on next
 * `open()` get a fresh effect run).
 */
import { useEffect, useRef } from 'react';
import { STDLIB_REGISTRY } from '../services/stdlib-registry';
import { useDocumentStore } from '../store/document';
import { type ApplyResult, apply, type Op } from '../store/ops';
import { type ReconcileOp, targetKindFor, useReconcileStore } from '../store/reconcile';
import { useUndoStore } from '../store/undo';

interface RawReconcileEntry {
  op: unknown;
  label: unknown;
  lossy: unknown;
}

function isRawEntry(value: unknown): value is RawReconcileEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as RawReconcileEntry;
  return typeof v.label === 'string' && typeof v.lossy === 'boolean' && typeof v.op === 'object';
}

export function useClaudeReconcile(): void {
  const isOpen = useReconcileStore((s) => s.isOpen);
  const status = useReconcileStore((s) => s.status);

  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isOpen || status !== 'loading') return;
    cancelledRef.current = false;

    const reconcileStore = useReconcileStore.getState();
    const docStore = useDocumentStore.getState();
    const mode = docStore.mode;

    if (mode !== 'project') {
      reconcileStore.setError('Reconcile is only available for project-mode documents.');
      return;
    }

    const targetPath = reconcileStore.targetPath;
    if (!targetPath) {
      reconcileStore.setError('No target file specified for reconciliation.');
      return;
    }

    void (async () => {
      const onDiskSource = await window.api?.readFileSilent(targetPath);
      if (cancelledRef.current) return;
      if (onDiskSource === null || onDiskSource === undefined) {
        reconcileStore.setError(`Cannot read ${targetPath}.`);
        return;
      }

      const schema = useUndoStore.getState().schema;
      const reconcileApi = window.contexture?.reconcile;
      if (!reconcileApi) {
        reconcileStore.setError('Reconcile IPC bridge is unavailable.');
        return;
      }

      const targetKind = targetKindFor(targetPath);

      let result: { ok: boolean; ops?: unknown[]; error?: string };
      try {
        result = await reconcileApi.query({
          irJson: JSON.stringify(schema),
          onDiskSource,
          targetKind,
        });
      } catch (err) {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        reconcileStore.setError(`Claude query failed: ${message}`);
        return;
      }
      if (cancelledRef.current) return;

      if (!result.ok) {
        reconcileStore.setError(result.error ?? 'Claude query failed.');
        return;
      }

      const rawOps = Array.isArray(result.ops) ? result.ops : [];
      const validated: ReconcileOp[] = [];
      for (const entry of rawOps) {
        if (!isRawEntry(entry)) {
          console.warn('[reconcile] dropping malformed op entry', entry);
          continue;
        }
        const op = entry.op as Op;
        const applyResult: ApplyResult = apply(schema, op, STDLIB_REGISTRY);
        if ('error' in applyResult) {
          console.warn('[reconcile] dropping invalid op', op, applyResult.error);
          continue;
        }
        validated.push({
          id: crypto.randomUUID(),
          op,
          label: entry.label as string,
          lossy: entry.lossy as boolean,
        });
      }

      // Empty array is a valid result — schemas already aligned.
      reconcileStore.setReady(validated, onDiskSource);
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [isOpen, status]);
}
