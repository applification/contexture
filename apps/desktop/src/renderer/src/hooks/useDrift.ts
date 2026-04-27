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
import { useEffect } from 'react';
import { useDocumentStore } from '../store/document';
import { useDriftStore } from '../store/drift';

const IR_SUFFIX = '.contexture.json';
const PACKAGES_SCHEMA_SUFFIX = '/packages/schema/';

/** Returns the monorepo root for a canonical scaffold IR path, or null. */
function projectRootFor(irPath: string): string | null {
  if (!irPath.endsWith(IR_SUFFIX)) return null;
  const slash = irPath.lastIndexOf('/');
  if (slash === -1) return null;
  const dir = irPath.slice(0, slash);
  if (!dir.endsWith('/packages/schema')) return null;
  return dir.slice(0, -PACKAGES_SCHEMA_SUFFIX.length + 1);
}

/** Returns the emitted.json path for a given IR path. */
function emittedJsonPathFor(irPath: string): string {
  const slash = irPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : irPath.slice(0, slash);
  return `${dir}/.contexture/emitted.json`;
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

    const root = projectRootFor(filePath);
    if (!root) {
      void driftApi.unwatch();
      return;
    }

    const watchedPath = `${root}/apps/web/convex/schema.ts`;
    const emittedJsonPath = emittedJsonPathFor(filePath);

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
