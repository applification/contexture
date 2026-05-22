import { AlertTriangle, GitCompareArrows } from 'lucide-react';
import { applyPendingModelSyncEvent } from '../../hooks/useModelSync';
import { sourceLabel, useModelSyncStore } from '../../store/model-sync';
import { Button } from '../ui/button';

export function ModelSyncBanner(): React.JSX.Element | null {
  const status = useModelSyncStore((s) => s.status);
  const notice = useModelSyncStore((s) => s.notice);
  const pendingEvent = useModelSyncStore((s) => s.pendingEvent);
  const invalidEvent = useModelSyncStore((s) => s.invalidEvent);
  const clearAttention = useModelSyncStore((s) => s.clearAttention);

  if (status === 'external_changes' && pendingEvent && notice) {
    return (
      <div
        role="alert"
        data-testid="model-sync-banner"
        className="flex items-center gap-2 px-3 py-2 bg-sky-50 dark:bg-sky-950/40 border-b border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-100 text-xs"
      >
        <GitCompareArrows className="size-3.5 shrink-0" />
        <span className="flex-1">
          External model changes are ready. {sourceLabel(notice.source)} changed{' '}
          <code className="font-mono">{pendingEvent.irPath.split('/').pop()}</code> while the
          current canvas has unsaved work.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={applyPendingModelSyncEvent}
        >
          Apply external changes
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAttention}>
          Keep current canvas
        </Button>
      </div>
    );
  }

  if (status === 'invalid_model' && invalidEvent) {
    return (
      <div
        role="alert"
        data-testid="model-sync-banner"
        className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border-b border-destructive/30 text-destructive text-xs"
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="flex-1">
          Model needs attention. The canvas is showing the last valid model.
          {invalidEvent.error ? ` ${invalidEvent.error}` : ''}
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAttention}>
          Dismiss
        </Button>
      </div>
    );
  }

  return null;
}
