/**
 * `useDrift` — mounts and tears down the drift watcher for the current
 * project-mode document.
 *
 * When a project-mode document is open, starts watching
 * `apps/web/convex/schema.ts` against `.contexture/emitted.json`.
 * Also triggers a manual re-check on window focus so edits made while
 * Contexture was in the background are caught immediately on return.
 *
 * Renders nothing — call once from App.tsx.
 */
import { bundlePathsFor, projectRootFor } from '@main/documents/document-store';
import { useEffect } from 'react';
import { useDocumentStore } from '../store/document';
import { useDriftStore } from '../store/drift';

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

    const root = projectRootFor(filePath);
    if (!root) {
      void driftApi.unwatch();
      return;
    }

    const paths = bundlePathsFor(filePath);
    const watchedPath = `${root}/apps/web/convex/schema.ts`;
    const emittedJsonPath = paths.emitted;

    void driftApi.watch({ watchedPath, emittedJsonPath });

    const unDetected = driftApi.onDetected(() => useDriftStore.getState().setDrifted());
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
