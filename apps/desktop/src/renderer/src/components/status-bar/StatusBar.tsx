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
import { useChatComposerStore } from '@renderer/store/chat-composer';
import { useConvexVersionStore } from '@renderer/store/convex-version';
import { useDocumentStore } from '@renderer/store/document';
import { sourceLabel, useModelSyncStore } from '@renderer/store/model-sync';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { useUndoStore } from '@renderer/store/undo';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { BarChart3, Circle, CircleAlert, Lightbulb, MessageSquare } from 'lucide-react';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function StatusBar(): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const filePath = useDocumentStore((s) => s.filePath);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const syncStatus = useModelSyncStore((s) => s.status);
  const syncNotice = useModelSyncStore((s) => s.notice);
  const click = useGraphSelectionStore((s) => s.click);
  const convexVersion = useConvexVersionStore();

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
        indexes += (type.indexes?.length ?? 0) + (type.searchIndexes?.length ?? 0);
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

  const validationIssues = useMemo(() => validate(schema, { stdlib: STDLIB_REGISTRY }), [schema]);
  const validationErrors = useMemo(
    () => validationIssues.filter((issue) => issue.severity === 'error'),
    [validationIssues],
  );
  const validationWarnings = useMemo(
    () => validationIssues.filter((issue) => issue.severity === 'warning'),
    [validationIssues],
  );
  const errorCount = validationErrors.length;
  const warningCount = validationWarnings.length;

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
            useGraphSelectionStore
              .getState()
              .selectField({ typeName: type.name, fieldName: field.name });
            useGraphSelectionStore.getState().focus({ nodeId: type.name, fieldName: field.name });
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

  function handleFixInChat(error: ValidationError): void {
    useChatComposerStore.getState().setPendingChatMessage({
      message: validationChatPrompt(error),
      context: ['## Current IR', '```json', JSON.stringify(schema, null, 2), '```'].join('\n'),
    });
    useUIChromeStore.getState().setSidebarTab('chat');
    useUIChromeStore.getState().setSidebarVisible(true);
    setPopoverOpen(false);
  }

  const tokenDisplay = tokenCount > 0 ? `~${tokenCount.toLocaleString()} tokens` : '0 tokens';
  const hasIssues = validationIssues.length > 0;
  const statusLabel =
    errorCount > 0
      ? `${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`
      : `${warningCount} ${warningCount === 1 ? 'advisory' : 'advisories'}`;

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

        {convexVersionStatusLabel(convexVersion) ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="whitespace-nowrap text-warning" data-testid="status-convex-version">
                {convexVersionStatusLabel(convexVersion)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="max-w-80 text-xs whitespace-pre-line">
                {convexVersionStatusTooltip(convexVersion)}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : null}

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
                aria-label={statusLabel}
              >
                {errorCount > 0 ? (
                  <CircleAlert className="size-3" />
                ) : (
                  <Lightbulb className="size-3" />
                )}
                <span>{statusLabel}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <div className="max-h-96 overflow-y-auto">
                {validationIssues.map((err) => {
                  const repair = repairForValidationError(schema, err);
                  const Icon = err.severity === 'error' ? CircleAlert : Lightbulb;
                  return (
                    <div
                      key={`${err.code}:${err.path}`}
                      className="space-y-2 border-b border-border px-3 py-2 text-xs last:border-b-0 hover:bg-muted"
                    >
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleErrorClick(err)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-start gap-2">
                            <Icon
                              className={cn(
                                'size-3 shrink-0 mt-0.5',
                                err.severity === 'error' ? 'text-destructive' : 'text-warning',
                              )}
                            />
                            <div className="min-w-0">
                              <div className="mb-0.5 font-mono text-[10px] text-muted-foreground/80">
                                {err.code}
                              </div>
                              <div className="font-medium whitespace-normal break-words">
                                {err.message}
                              </div>
                              <div className="text-muted-foreground/70 whitespace-normal break-all">
                                {err.path}
                              </div>
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
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleFixInChat(err)}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-background"
                        >
                          <MessageSquare aria-hidden="true" className="size-3" />
                          Discuss in chat
                        </button>
                      </div>
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

function validationChatPrompt(error: ValidationError): string {
  return [
    'Help me resolve this Contexture validation issue.',
    '',
    `Code: ${error.code}`,
    `Severity: ${error.severity}`,
    `Path: ${error.path}`,
    `Message: ${error.message}`,
    error.hint ? `Hint: ${error.hint}` : null,
    '',
    'Please review the current IR and suggest the smallest safe model change. If the fix should be app-runtime owned instead of modeled, explain the runtime contract to document.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function convexVersionStatusLabel(version: {
  status: string;
  emitterVersion: string | null;
  targetVersion: string | null;
}): string | null {
  if (version.status === 'mismatch') return 'Convex mismatch';
  if (version.status === 'target_missing') return 'Convex target unknown';
  if (version.status === 'probe_failed') return 'Convex probe failed';
  return null;
}

function convexVersionStatusTooltip(version: {
  status: string;
  emitterVersion: string | null;
  targetVersion: string | null;
  targetPackagePath: string | null;
  message: string | null;
}): string {
  return [
    `Emitter Convex: ${version.emitterVersion ?? 'unknown'}`,
    `Target app Convex: ${version.targetVersion ?? 'not detected'}`,
    version.targetPackagePath ? `Package: ${version.targetPackagePath}` : null,
    version.message,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
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
