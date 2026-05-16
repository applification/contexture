/**
 * `DriftBanner` — non-blocking banner shown at the top of the graph
 * view when any `@contexture-generated` file has drifted from the
 * emitted manifest or can no longer be read.
 *
 * Single-file drift shows the file path; multi-file drift shows a count.
 * "Review changes" opens the reconcile modal for the first drifted file;
 * "Dismiss" hides the banner until the next drift event.
 */
import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { useDriftStore } from '../../store/drift';
import { useReconcileStore } from '../../store/reconcile';
import { Button } from '../ui/button';

function shortPath(fullPath: string): string {
  const marker = 'packages/contexture/';
  const idx = fullPath.lastIndexOf(marker);
  if (idx !== -1) return fullPath.slice(idx);
  const slash = fullPath.lastIndexOf('/');
  return slash === -1 ? fullPath : fullPath.slice(slash + 1);
}

export function DriftBanner(): React.JSX.Element | null {
  const files = useDriftStore((s) => s.files);
  const driftedPaths = useDriftStore((s) => s.driftedPaths);
  const dismiss = useDriftStore((s) => s.dismiss);
  const openReconcile = useReconcileStore((s) => s.open);

  const message = useMemo(() => {
    const statuses =
      files.length > 0 ? files : driftedPaths.map((path) => ({ path, status: 'drifted' as const }));
    if (statuses.length === 0) return null;
    const unreadableCount = statuses.filter((file) => file.status === 'unreadable').length;
    if (statuses.length === 1) {
      const file = statuses[0];
      if (!file) return null;
      if (file.status === 'unreadable') {
        return (
          <>
            <code className="font-mono">{shortPath(file.path)}</code> is missing or unreadable.
          </>
        );
      }
      return (
        <>
          <code className="font-mono">{shortPath(file.path)}</code> was modified outside Contexture.
        </>
      );
    }
    if (unreadableCount > 0) {
      return (
        <>
          {statuses.length} generated files need attention, including {unreadableCount} missing or
          unreadable.
        </>
      );
    }
    return <>{statuses.length} generated files were modified outside Contexture.</>;
  }, [files, driftedPaths]);

  if (!message) return null;

  // For multi-file drift, review the first drifted file. The user can
  // dismiss and let the banner re-appear for subsequent files, or use
  // the per-file list that drift detection surfaces.
  const reviewTarget =
    (files.find((file) => file.status === 'drifted') ?? files[0])?.path ?? driftedPaths[0];

  return (
    <div
      role="alert"
      data-testid="drift-banner"
      className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="flex-1">{message}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => reviewTarget && openReconcile(reviewTarget)}
        aria-label="Review changes"
      >
        Review changes
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={dismiss}
        aria-label="Dismiss drift banner"
      >
        Dismiss
      </Button>
    </div>
  );
}
