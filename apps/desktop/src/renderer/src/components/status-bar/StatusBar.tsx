/**
 * Bottom status bar — file path, type count, field count, validation
 * errors popover, token estimate against the emitted Zod source, and
 * the analytics opt-out toggle.
 *
 * Dirty-doc colour driven by `useDocumentStore.isDirty`. The
 * pre-pivot app also surfaced file-format ("Turtle" / "RDF/XML" /
 * "JSON-LD"); Contexture only has `.contexture.json` so that row is
 * gone.
 */

import { getAnalyticsOptOut, setAnalyticsOptOut } from '@renderer/lib/analytics';
import { emit as emitZod } from '@renderer/model/emit-zod';
import { STDLIB_REGISTRY } from '@renderer/services/stdlib-registry';
import { estimateTokenCount } from '@renderer/services/tokens';
import { type ValidationError, validate } from '@renderer/services/validation';
import { useDocumentStore } from '@renderer/store/document';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { BarChart3, Circle, CircleAlert, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function StatusBar(): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const filePath = useDocumentStore((s) => s.filePath);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const click = useGraphSelectionStore((s) => s.click);

  const typeCount = schema.types.length;
  const fieldCount = useMemo(() => {
    let n = 0;
    for (const t of schema.types) {
      if (t.kind === 'object') n += t.fields.length;
    }
    return n;
  }, [schema]);

  const tokenCount = useMemo(() => {
    if (typeCount === 0) return 0;
    try {
      return estimateTokenCount(emitZod(schema, filePath ?? 'untitled.contexture.json'));
    } catch {
      // Emitter throws on malformed IR; treat as zero rather than crashing
      // the status bar.
      return 0;
    }
  }, [schema, filePath, typeCount]);

  const errors = useMemo(() => validate(schema, { stdlib: STDLIB_REGISTRY }), [schema]);
  // Validation surfaces a single severity today ("error"), but the bar
  // mirrors the pre-pivot counters so future warning-level rules drop
  // in cleanly.
  const errorCount = errors.length;
  const warnCount = 0;

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [analyticsOff, setAnalyticsOff] = useState(() => getAnalyticsOptOut());

  const toggleAnalytics = useCallback(() => {
    const next = !analyticsOff;
    setAnalyticsOptOut(next);
    setAnalyticsOff(next);
  }, [analyticsOff]);

  function handleErrorClick(error: ValidationError): void {
    // Paths are dotted (`types.3.fields.0.type`); pick the enclosing
    // TypeDef by index so clicking an error selects the right node.
    const match = error.path.match(/^types\.(\d+)/);
    if (match) {
      const idx = Number(match[1]);
      const t = schema.types[idx];
      if (t) click(t.name, 'replace');
    }
    setPopoverOpen(false);
  }

  const tokenDisplay = tokenCount > 0 ? `~${tokenCount.toLocaleString()} tokens` : '0 tokens';
  const hasIssues = errorCount + warnCount > 0;

  return (
    <div
      className={cn(
        'h-7 border-t px-3 flex items-center text-xs gap-4 shrink-0 relative transition-colors duration-200',
        isDirty
          ? 'bg-warning/10 border-warning/30 text-warning-foreground'
          : 'bg-card border-border text-muted-foreground',
      )}
    >
      <TooltipProvider delayDuration={300}>
        {/* Save-state dot — amber while the document has unsaved edits,
            green once clean. Mirrors the pre-pivot status bar so the
            save indicator sits in the same spot users already scan. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5">
              <Circle
                className={cn(
                  'size-2 shrink-0 transition-colors duration-200',
                  isDirty ? 'fill-warning text-warning' : 'fill-success/70 text-success/70',
                )}
              />
              <span>{isDirty ? 'Unsaved changes' : 'Saved'}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">
              {isDirty ? 'You have unsaved changes — press ⌘S to save' : 'All changes saved'}
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate max-w-[40vw]">
              {filePath ? filePath.split('/').pop() : 'Untitled'}
            </span>
          </TooltipTrigger>
          {filePath && <TooltipContent>{filePath}</TooltipContent>}
        </Tooltip>

        <span>
          {typeCount} types · {fieldCount} fields
        </span>

        <span>{tokenDisplay}</span>

        <div className="flex-1" />

        {hasIssues ? (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors',
                  errorCount > 0 ? 'text-destructive' : 'text-warning',
                )}
              >
                {errorCount > 0 ? (
                  <CircleAlert className="size-3" />
                ) : (
                  <TriangleAlert className="size-3" />
                )}
                <span>
                  {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <div className="max-h-64 overflow-y-auto">
                {errors.map((err) => (
                  <button
                    type="button"
                    key={`${err.code}:${err.path}`}
                    onClick={() => handleErrorClick(err)}
                    className="w-full text-left px-3 py-2 text-xs border-b border-border last:border-b-0 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <CircleAlert className="size-3 shrink-0 mt-0.5 text-destructive" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{err.message}</div>
                        <div className="text-muted-foreground/70 truncate">{err.path}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="flex items-center gap-1">
            <Circle className="size-3 fill-current" />
            <span>no errors</span>
          </span>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleAnalytics}
              className="hover:text-foreground transition-colors"
              aria-label="Toggle analytics"
            >
              <BarChart3 className={cn('size-3', analyticsOff && 'text-muted-foreground/40')} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Analytics {analyticsOff ? 'off' : 'on'} — click to toggle</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
