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

/**
 * Derives drift-related paths from the IR file path.
 *
 * IR lives at: <root>/packages/schema/<name>.contexture.json
 * Convex schema: <root>/packages/schema/convex/schema.ts
 *   → same dir as the IR, subdir convex/
 * Emitted manifest: <root>/packages/schema/.contexture/emitted.json
 *   → same dir as the IR, subdir .contexture/
 *
 * Both use the same base dir, so we never need to compute the monorepo
 * root — just strip the IR filename and append the relative paths.
 * This guarantees watchedPath matches the key written into emitted.json
 * by document-store (which also derives paths from the same IR path).
 */
function driftPathsFor(irPath: string): { watchedPath: string; emittedJsonPath: string } | null {
  if (!irPath.endsWith(IR_SUFFIX)) return null;
  const slash = irPath.lastIndexOf('/');
  if (slash === -1) return null;
  const dir = irPath.slice(0, slash); // e.g. /proj/packages/schema
  return {
    watchedPath: `${dir}/convex/schema.ts`,
    emittedJsonPath: `${dir}/.contexture/emitted.json`,
  };
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

    const paths = driftPathsFor(filePath);
    if (!paths) {
      void driftApi.unwatch();
      return;
    }

    const { watchedPath, emittedJsonPath } = paths;

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
