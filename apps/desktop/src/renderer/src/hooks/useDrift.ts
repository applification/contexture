/**
 * `useDrift` — mounts and tears down the drift watcher for the current
 * project-mode document.
 *
 * When a project-mode document is open, starts watching all
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
 * Derives the emitted-manifest path from the IR file path.
 *
 * IR lives at: <root>/packages/contexture/<name>.contexture.json
 * Emitted manifest: <root>/packages/contexture/.contexture/emitted.json
 */
export function emittedPathFor(irPath: string): string | null {
  if (!irPath.endsWith(IR_SUFFIX)) return null;
  const slash = irPath.lastIndexOf('/');
  if (slash === -1) return null;
  const dir = irPath.slice(0, slash);
  return `${dir}/.contexture/emitted.json`;
}

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

    if (mode !== 'project' || !filePath) {
      void driftApi.unwatch();
      useDriftStore.getState().setResolved();
      return;
    }

    const emittedJsonPath = emittedPathFor(filePath);
    if (!emittedJsonPath) {
      void driftApi.unwatch();
      return;
    }

    void driftApi.watch({ emittedJsonPath });

    const unDetected = driftApi.onDetected((payload) =>
      useDriftStore.getState().setDrifted(payload.paths),
    );
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
