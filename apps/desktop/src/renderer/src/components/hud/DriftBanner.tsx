/**
 * `DriftBanner` — non-blocking banner shown at the top of the graph
 * view when `packages/contexture/convex/schema.ts` has been hand-edited outside
 * Contexture (drift detected by the main-process watcher).
 *
 * "Review changes" opens the reconcile modal (see #126); "Dismiss"
 * hides the banner until the next drift event.
 */
import { AlertTriangle } from 'lucide-react';
import { useDriftStore } from '../../store/drift';
import { useReconcileStore } from '../../store/reconcile';
import { Button } from '../ui/button';

export function DriftBanner(): React.JSX.Element | null {
  const isDrifted = useDriftStore((s) => s.isDrifted);
  const dismiss = useDriftStore((s) => s.dismiss);
  const openReconcile = useReconcileStore((s) => s.open);

  if (!isDrifted) return null;

  return (
    <div
      role="alert"
      data-testid="drift-banner"
      className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="flex-1">
        <code className="font-mono">packages/contexture/convex/schema.ts</code> was modified outside
        Contexture.
      </span>
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
