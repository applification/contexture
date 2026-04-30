/**
 * `DriftBanner` — non-blocking banner shown at the top of the graph
 * view when any `@contexture-generated` file has been hand-edited
 * outside Contexture (drift detected by the main-process watcher).
 *
 * Single-file drift shows the file path; multi-file drift shows a count.
 * "Review changes" opens the reconcile modal; "Dismiss" hides the banner
 * until the next drift event.
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
  const driftedPaths = useDriftStore((s) => s.driftedPaths);
  const dismiss = useDriftStore((s) => s.dismiss);
  const openReconcile = useReconcileStore((s) => s.open);

  const message = useMemo(() => {
    if (driftedPaths.length === 0) return null;
    if (driftedPaths.length === 1) {
      return (
        <>
          <code className="font-mono">{shortPath(driftedPaths[0])}</code> was modified outside
          Contexture.
        </>
      );
    }
    return <>{driftedPaths.length} generated files were modified outside Contexture.</>;
  }, [driftedPaths]);

  if (!message) return null;

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
        onClick={openReconcile}
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
