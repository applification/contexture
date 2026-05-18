/**
 * `useDrift` — mounts and tears down the drift watcher for the current
 * bundle-mode document.
 *
 * When a bundle-mode document is open, starts watching all
 * `@contexture-generated` files listed in `.contexture/emitted.json`.
 * Also triggers a manual re-check on window focus so edits made while
 * Contexture was in the background are caught immediately on return.
 *
 * Renders nothing — call once from App.tsx.
 */
import { useEffect } from 'react';
import { useDocumentStore } from '../store/document';
import { useDriftStore } from '../store/drift';

const IR_SUFFIX = '.contexture.json';

/**
 * Derives the Convex schema path from the IR file path.
 * Used by the reconcile hook to read the on-disk Convex source.
 */
export function convexPathFor(irPath: string): string | null {
  if (!irPath.endsWith(IR_SUFFIX)) return null;
  const slash = irPath.lastIndexOf('/');
  if (slash === -1) return null;
  const dir = irPath.slice(0, slash);
  return `${dir}/convex/schema.ts`;
}

export function useDrift(): void {
  const filePath = useDocumentStore((s) => s.filePath);
  const mode = useDocumentStore((s) => s.mode);

  useEffect(() => {
    const driftApi = window.contexture?.drift;
    if (!driftApi) return;

    if (mode !== 'bundle' || !filePath) {
      void driftApi.unwatch();
      useDriftStore.getState().setResolved();
      return;
    }

    if (!filePath.endsWith(IR_SUFFIX)) {
      void driftApi.unwatch();
      return;
    }

    void driftApi.watch({ irPath: filePath });

    const unDetected = driftApi.onDetected((payload) => {
      if (payload.files) useDriftStore.getState().setDetected(payload.files);
      else useDriftStore.getState().setDrifted(payload.paths);
    });
    const unResolved = driftApi.onResolved(() => useDriftStore.getState().setResolved());

    function onFocus(): void {
      void driftApi?.check();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      void driftApi.unwatch();
      unDetected();
      unResolved();
      window.removeEventListener('focus', onFocus);
    };
  }, [filePath, mode]);
}
