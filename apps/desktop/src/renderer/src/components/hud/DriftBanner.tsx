/**
 * `DriftBanner` — non-blocking banner shown at the top of the graph
 * view when `apps/web/convex/schema.ts` has been hand-edited outside
 * Contexture (drift detected by the main-process watcher).
 *
 * "Review changes" is disabled in this slice (reconcile modal lands in
 * #126). "Dismiss" hides the banner until the next drift event.
 */
import { AlertTriangle } from 'lucide-react';
import { useDriftStore } from '../../store/drift';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export function DriftBanner(): React.JSX.Element | null {
  const isDrifted = useDriftStore((s) => s.isDrifted);
  const dismiss = useDriftStore((s) => s.dismiss);

  if (!isDrifted) return null;

  return (
    <div
      role="alert"
      data-testid="drift-banner"
      className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="flex-1">
        <code className="font-mono">apps/web/convex/schema.ts</code> was modified outside
        Contexture.
      </span>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={-1}>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled
                aria-label="Review changes (coming soon)"
              >
                Review changes
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Reconcile modal coming in the next release.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
