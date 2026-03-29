import { useEffect, useCallback } from 'react';
import { X, Check, Loader } from 'lucide-react';
import { useEvalStore } from '@renderer/store/eval';
import { cn } from '@/lib/utils';

export function ImprovementHUD(): React.JSX.Element | null {
  const improvementItems = useEvalStore((s) => s.improvementItems);
  const improvementStatus = useEvalStore((s) => s.improvementStatus);
  const markItemDone = useEvalStore((s) => s.markItemDone);
  const finishImprovements = useEvalStore((s) => s.finishImprovements);
  const dismissImprovements = useEvalStore((s) => s.dismissImprovements);

  const doneCount = improvementItems.filter((i) => i.status === 'done').length;
  const total = improvementItems.length;

  const handleText = useCallback(
    (text: string) => {
      const matches = [...text.matchAll(/✅\s*DONE:\s*(\d+)/g)];
      for (const match of matches) {
        const n = parseInt(match[1], 10) - 1; // convert 1-indexed to 0-indexed
        markItemDone(n);
      }
    },
    [markItemDone],
  );

  useEffect(() => {
    if (improvementStatus !== 'running') return;

    const cleanups = [
      window.api.onClaudeAssistantText(handleText),
      window.api.onClaudeResult(() => finishImprovements()),
      window.api.onClaudeError(() => finishImprovements()),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [improvementStatus, handleText, finishImprovements]);

  if (improvementStatus === 'idle') return null;

  return (
    <div className="absolute top-3 right-3 z-50 w-56 rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Improvements</span>
          <span className="text-xs text-muted-foreground font-mono">
            {doneCount}/{total}
          </span>
        </div>
        {improvementStatus === 'complete' && (
          <button
            onClick={dismissImprovements}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: total > 0 ? `${(doneCount / total) * 100}%` : '0%' }}
        />
      </div>

      {/* Items */}
      <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
        {improvementItems.map((item, i) => (
          <div key={i} className="flex items-start gap-2 px-1 py-0.5">
            <div className="shrink-0 mt-0.5">
              <StatusIcon status={item.status} />
            </div>
            <span
              className={cn(
                'text-xs leading-relaxed',
                item.status === 'done' && 'text-muted-foreground line-through',
                item.status === 'active' && 'text-foreground',
                item.status === 'pending' && 'text-muted-foreground',
              )}
            >
              {item.text}
            </span>
          </div>
        ))}
      </div>

      {improvementStatus === 'complete' && (
        <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-1.5">
          <Check className="size-3 text-green-500" />
          All improvements applied
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: 'pending' | 'active' | 'done' }): React.JSX.Element {
  if (status === 'done') {
    return (
      <div className="size-4 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
        <Check className="size-2.5 text-green-500" />
      </div>
    );
  }
  if (status === 'active') {
    return (
      <div className="size-4 rounded-full border border-primary/50 flex items-center justify-center">
        <Loader className="size-2.5 text-primary animate-spin" />
      </div>
    );
  }
  return <div className="size-4 rounded-full border border-border" />;
}
