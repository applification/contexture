/**
 * `useSchemaAgentReconcile` fires the one-shot schema-agent reconcile
 * query when the modal opens and feeds the result into the store.
 *
 * Sequence:
 *   1. Read the on-disk source for the target path via
 *      `window.contexture.reconcile.readGeneratedTarget`.
 *   2. Snapshot the current IR from the undo store.
 *   3. Derive the target kind from the file path.
 *   4. Round-trip via the provider-neutral reconcile bridge.
 *   5. Validate each returned op by attempting to apply it to a copy
 *      of the schema — invalid entries are dropped with a console
 *      warning rather than failing the whole load.
 *   6. Push the surviving ops into the reconcile store.
 *
 * Drops state updates after the modal closes (re-mounts on next
 * `open()` get a fresh effect run).
 */

import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { useEffect, useRef } from 'react';
import { useDocumentStore } from '../store/document';
import { useDriftStore } from '../store/drift';
import { type ApplyResult, apply, type Op } from '../store/ops';
import { type ReconcileOp, targetKindFor, useReconcileStore } from '../store/reconcile';
import { useUndoStore } from '../store/undo';

interface RawReconcileEntry {
  op: unknown;
  label: unknown;
  lossy: unknown;
  provenance?: unknown;
}

function isRawEntry(value: unknown): value is RawReconcileEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as RawReconcileEntry;
  return typeof v.label === 'string' && typeof v.lossy === 'boolean' && typeof v.op === 'object';
}

export function useSchemaAgentReconcile(): void {
  const isOpen = useReconcileStore((s) => s.isOpen);
  const status = useReconcileStore((s) => s.status);

  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isOpen || status !== 'loading') return;
    cancelledRef.current = false;

    const reconcileStore = useReconcileStore.getState();
    const docStore = useDocumentStore.getState();
    const mode = docStore.mode;

    if (mode !== 'bundle') {
      reconcileStore.setError('Reconcile is only available for bundle-mode documents.');
      return;
    }

    const targetPath = reconcileStore.targetPath;
    if (!targetPath) {
      reconcileStore.setError('No target file specified for reconciliation.');
      return;
    }

    void (async () => {
      const irPath = docStore.filePath;
      if (!irPath) {
        reconcileStore.setError('No open Contexture document.');
        return;
      }

      const schema = useUndoStore.getState().schema;
      const targetKind = targetKindFor(targetPath, irPath, schema);
      const driftStatus =
        useDriftStore.getState().files.find((file) => file.path === targetPath)?.status ?? null;

      const onDiskSource = await window.contexture?.reconcile.readGeneratedTarget({
        irPath,
        targetPath,
      });
      if (cancelledRef.current) return;
      if (onDiskSource === null || onDiskSource === undefined) {
        if (
          targetKind !== 'unknown' &&
          (driftStatus === 'missing' || driftStatus === 'unreadable')
        ) {
          reconcileStore.setReady([], '');
          return;
        }
        reconcileStore.setError(`Cannot read ${targetPath}.`);
        return;
      }

      let validationSchema = schema;
      const reconcileApi = window.contexture?.reconcile;
      if (!reconcileApi) {
        reconcileStore.setError('Reconcile IPC bridge is unavailable.');
        return;
      }

      let result: {
        ok: boolean;
        ops?: unknown[];
        error?: string;
        deterministicFallbackReason?: string;
      };
      try {
        result = await reconcileApi.query({
          irJson: JSON.stringify(schema),
          onDiskSource,
          targetKind,
        });
      } catch (err) {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        reconcileStore.setError(`Reconcile proposal failed: ${message}`);
        return;
      }
      if (cancelledRef.current) return;

      if (!result.ok) {
        reconcileStore.setError(result.error ?? 'Reconcile proposal failed.');
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
        const applyResult: ApplyResult = apply(validationSchema, op, STDLIB_REGISTRY);
        if ('error' in applyResult) {
          console.warn('[reconcile] dropping invalid op', op, applyResult.error);
          continue;
        }
        validationSchema = applyResult.schema;
        validated.push({
          id: crypto.randomUUID(),
          op,
          label: entry.label as string,
          lossy: entry.lossy as boolean,
          provenance: entry.provenance === 'deterministic' ? 'deterministic' : 'provider',
        });
      }

      // Empty array is a valid result — schemas already aligned.
      reconcileStore.setReady(validated, onDiskSource, {
        ...(result.deterministicFallbackReason
          ? { deterministicFallbackReason: result.deterministicFallbackReason }
          : {}),
      });
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [isOpen, status]);
}
