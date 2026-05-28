/**
 * Bottom status bar — file path, type count, field count, validation
 * errors popover, token estimate against the emitted Zod source, and
 * the analytics opt-out toggle.
 *
 * Dirty-doc colour is driven by `useDocumentStore.isDirty`.
 */

import { emit as emitZod } from '@contexture/core/emit-zod';
import type { FieldType } from '@contexture/core/ir';
import { getAnalyticsOptOut, setAnalyticsOptOut } from '@renderer/lib/analytics';
import { estimateTokenCount } from '@renderer/services/tokens';
import { type ValidationError, validate } from '@renderer/services/validation';
import { parseTypePath, repairForValidationError } from '@renderer/services/validation-repairs';
import { useDocumentStore } from '@renderer/store/document';
import { sourceLabel, useModelSyncStore } from '@renderer/store/model-sync';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { BarChart3, Circle, CircleAlert } from 'lucide-react';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { TYPE_NODE_EVENT } from '../graph/nodes/TypeNode';

export function StatusBar(): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const filePath = useDocumentStore((s) => s.filePath);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const syncStatus = useModelSyncStore((s) => s.status);
  const syncNotice = useModelSyncStore((s) => s.notice);
  const click = useGraphSelectionStore((s) => s.click);

  const typeCount = schema.types.length;
  const fieldCount = useMemo(() => {
    let n = 0;
    for (const t of schema.types) {
      if (t.kind === 'object') n += t.fields.length;
    }
    return n;
  }, [schema]);
  const convexSummary = useMemo(() => {
    let tables = 0;
    let refs = 0;
    let indexes = 0;
    for (const type of schema.types) {
      if (type.kind !== 'object') continue;
      if (type.table === true) {
        tables += 1;
        indexes += type.indexes?.length ?? 0;
      }
      for (const field of type.fields) refs += countRefs(field.type);
    }
    return { tables, refs, indexes };
  }, [schema]);

  const tokenCount = useMemo(() => {
    if (typeCount === 0) return 0;
    try {
      return estimateTokenCount(
        emitZod(schema, filePath ?? 'untitled.contexture.json', {
          stdlibNamespaces: STDLIB_REGISTRY.namespaces,
        }),
      );
    } catch {
      // Emitter throws on malformed IR; treat as zero rather than crashing
      // the status bar.
      return 0;
    }
  }, [schema, filePath, typeCount]);

  const errors = useMemo(() => validate(schema, { stdlib: STDLIB_REGISTRY }), [schema]);
  const errorCount = errors.length;

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
    const loc = parseTypePath(error.path);
    if (loc) {
      const type = schema.types[loc.typeIndex];
      if (type) {
        click(type.name, 'replace');
        if (type.kind === 'object' && loc.fieldIndex !== undefined) {
          const field = type.fields[loc.fieldIndex];
          if (field) {
            useGraphSelectionStore.getState().focus({ nodeId: type.name, fieldName: field.name });
            document.dispatchEvent(
              new CustomEvent(TYPE_NODE_EVENT, {
                detail: { typeName: type.name, fieldName: field.name },
              }),
            );
          }
        } else {
          useGraphSelectionStore.getState().focus(type.name);
        }
      }
    }
    setPopoverOpen(false);
  }

  function handleRepair(error: ValidationError): void {
    const repair = repairForValidationError(schema, error);
    if (!repair) return;
    const result = useUndoStore.getState().apply(repair.op);
    if ('error' in result) return;
    if (repair.focusTypeName) {
      click(repair.focusTypeName, 'replace');
      useGraphSelectionStore.getState().focus(repair.focusTypeName);
    }
    setPopoverOpen(false);
  }

  const tokenDisplay = tokenCount > 0 ? `~${tokenCount.toLocaleString()} tokens` : '0 tokens';
  const hasIssues = errorCount > 0;

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
            green once clean. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5">
              <Circle
                className={cn(
                  'size-2 shrink-0 transition-colors duration-200',
                  isDirty ? 'fill-warning text-warning' : 'fill-success/70 text-success/70',
                )}
              />
              <span>{saveStateLabel(isDirty, syncStatus, syncNotice)}</span>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="whitespace-nowrap">
              {convexSummary.tables} Convex tables · {convexSummary.refs} refs ·{' '}
              {convexSummary.indexes} indexes
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">
              Object types marked as Convex tables, ref fields, and configured table indexes.
            </p>
          </TooltipContent>
        </Tooltip>

        <span>{tokenDisplay}</span>

        {syncNotice && syncStatus === 'synced' && (
          <span className="text-sky-700 dark:text-sky-300">
            Synced from {sourceLabel(syncNotice.source)} · {syncNotice.changeCount}{' '}
            {syncNotice.changeCount === 1 ? 'change' : 'changes'}
          </span>
        )}

        {syncStatus === 'external_changes' && (
          <span className="text-sky-700 dark:text-sky-300">External changes pending</span>
        )}

        {syncStatus === 'invalid_model' && <span className="text-destructive">Invalid model</span>}

        <div className="flex-1" />

        {hasIssues ? (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors',
                  'text-destructive',
                )}
              >
                <CircleAlert className="size-3" />
                <span>
                  {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <div className="max-h-64 overflow-y-auto">
                {errors.map((err) => {
                  const repair = repairForValidationError(schema, err);
                  return (
                    <div
                      key={`${err.code}:${err.path}`}
                      className="flex gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0 hover:bg-muted"
                    >
                      <button
                        type="button"
                        onClick={() => handleErrorClick(err)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-start gap-2">
                          <CircleAlert className="size-3 shrink-0 mt-0.5 text-destructive" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{err.message}</div>
                            <div className="text-muted-foreground/70 truncate">{err.path}</div>
                          </div>
                        </div>
                      </button>
                      {repair && (
                        <button
                          type="button"
                          onClick={() => handleRepair(err)}
                          className="self-start rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-background"
                        >
                          {repair.label}
                        </button>
                      )}
                    </div>
                  );
                })}
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

function countRefs(type: FieldType): number {
  if (type.kind === 'ref') return 1;
  if (type.kind === 'array') return countRefs(type.element);
  return 0;
}

function saveStateLabel(
  isDirty: boolean,
  syncStatus: ReturnType<typeof useModelSyncStore.getState>['status'],
  syncNotice: ReturnType<typeof useModelSyncStore.getState>['notice'],
): string {
  if (syncStatus === 'syncing') return 'Syncing...';
  if (syncStatus === 'synced' && syncNotice) return 'Synced';
  if (syncStatus === 'external_changes') return 'External changes';
  if (syncStatus === 'invalid_model') return 'Invalid model';
  return isDirty ? 'Unsaved changes' : 'Saved';
}
