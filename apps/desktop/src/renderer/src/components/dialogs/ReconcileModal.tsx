/**
 * `ReconcileModal` — drift reconciliation surface (issue #161).
 *
 * Opens from `DriftBanner`'s "Review changes" button when any watched
 * generated file has been hand-edited. Two-pane layout:
 *
 *   - Left: LLM-proposed op checklist (each row = one IR op).
 *     Toggling a row re-renders the right pane.
 *   - Right: `@pierre/diffs` split view between the Contexture emit
 *     of (current IR + selected ops) and the user's edited file on
 *     disk, with a residual changed-line count underneath.
 *
 * Apply selected → run checked ops through the undo store as one
 * transaction, mark drift resolved, close.
 * Regenerate from IR → overwrite the generated target with the
 * current Contexture emit, without applying any proposed ops.
 * Open in chat → seed a new chat thread with IR + source + proposed ops.
 * Leave dirty → close the modal and leave drift state alone.
 */

import { emitAiToolSchemas } from '@contexture/core/emit-ai-tool-schemas';
import { emitConvexSchema } from '@contexture/core/emit-convex';
import { emitFormValidators } from '@contexture/core/emit-form-validators';
import { emit as emitJsonSchema } from '@contexture/core/emit-json-schema';
import { emitMcpDefinitions } from '@contexture/core/emit-mcp-definitions';
import { emit as emitSchemaIndex } from '@contexture/core/emit-schema-index';
import { emitStructuredOutputSchemas } from '@contexture/core/emit-structured-output-schemas';
import { emit as emitZod } from '@contexture/core/emit-zod';
import type { Schema } from '@contexture/core/ir';
import { baseNameFor } from '@contexture/core/paths';
import { MultiFileDiff } from '@pierre/diffs/react';
import { useChatThreads } from '@renderer/chat/useChatThreads';
import { useSchemaAgentReconcile } from '@renderer/hooks/useSchemaAgentReconcile';
import { useDocumentStore } from '@renderer/store/document';
import { useDriftStore } from '@renderer/store/drift';
import { apply } from '@renderer/store/ops';
import {
  type ReconcileOp,
  type TargetKind,
  targetKindFor,
  useReconcileStore,
} from '@renderer/store/reconcile';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { useUndoStore } from '@renderer/store/undo';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { diffLines } from 'diff';
import { Loader2, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EmitResult {
  source: string;
  error: string | null;
}

function safeEmitForTarget(
  schema: Schema,
  targetPath: string,
  irPath: string | null,
  kind: TargetKind = targetKindFor(targetPath),
): EmitResult {
  try {
    let source: string;
    switch (kind) {
      case 'convex':
        source = emitConvexSchema(schema, irPath ?? undefined);
        break;
      case 'zod':
        source = emitZod(schema, irPath ?? '<unknown>', {
          stdlibNamespaces: STDLIB_REGISTRY.namespaces,
        });
        break;
      case 'json-schema':
        source = `${JSON.stringify(
          emitJsonSchema(schema, undefined, irPath ?? undefined, {
            stdlibNamespaces: STDLIB_REGISTRY.namespaces,
          }),
          null,
          2,
        )}\n`;
        break;
      case 'schema-index':
        source = emitSchemaIndex(irPath ? baseNameFor(irPath) : 'schema', irPath ?? undefined);
        break;
      case 'ai-tool-schemas':
        source = `${JSON.stringify(emitAiToolSchemas(schema, irPath ?? undefined), null, 2)}\n`;
        break;
      case 'structured-output-schemas':
        source = `${JSON.stringify(
          emitStructuredOutputSchemas(schema, irPath ?? undefined),
          null,
          2,
        )}\n`;
        break;
      case 'mcp-definitions':
        source = `${JSON.stringify(emitMcpDefinitions(schema, irPath ?? undefined), null, 2)}\n`;
        break;
      case 'form-validators':
        source = emitFormValidators(
          schema,
          irPath ? baseNameFor(irPath) : 'schema',
          irPath ?? undefined,
        );
        break;
      case 'unknown':
        return { source: '', error: `Cannot emit for unknown target kind (${targetPath}).` };
    }
    return { source, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source: '', error: message };
  }
}

function applySelectedOps(
  schema: Schema,
  proposedOps: ReconcileOp[],
  selectedIndices: Set<number>,
): { schema: Schema; error: string | null } {
  let next = schema;
  for (let i = 0; i < proposedOps.length; i += 1) {
    if (!selectedIndices.has(i)) continue;
    const result = apply(next, proposedOps[i].op, STDLIB_REGISTRY);
    if ('error' in result) {
      return { schema: next, error: result.error };
    }
    next = result.schema;
  }
  return { schema: next, error: null };
}

function countResidualLines(left: string, right: string): number {
  if (left === right) return 0;
  const changes = diffLines(left, right);
  let n = 0;
  for (const c of changes) {
    if (c.added || c.removed) n += c.count ?? 0;
  }
  return n;
}

/** Short display name for a path, trimmed to the portion after `packages/contexture/`. */
function shortPath(fullPath: string): string {
  const marker = 'packages/contexture/';
  const idx = fullPath.lastIndexOf(marker);
  if (idx !== -1) return fullPath.slice(idx + marker.length);
  const slash = fullPath.lastIndexOf('/');
  return slash === -1 ? fullPath : fullPath.slice(slash + 1);
}

function generatedTargetKindFor(targetPath: string | null, irPath: string | null): TargetKind {
  if (!targetPath || !irPath) return 'unknown';
  return targetKindFor(targetPath, irPath);
}

export function ReconcileModal(): React.JSX.Element {
  const isOpen = useReconcileStore((s) => s.isOpen);
  const status = useReconcileStore((s) => s.status);
  const proposedOps = useReconcileStore((s) => s.proposedOps);
  const selectedIndices = useReconcileStore((s) => s.selectedIndices);
  const error = useReconcileStore((s) => s.error);
  const onDiskSource = useReconcileStore((s) => s.onDiskSource);
  const targetPath = useReconcileStore((s) => s.targetPath);
  const close = useReconcileStore((s) => s.close);
  const setLoading = useReconcileStore((s) => s.setLoading);
  const setError = useReconcileStore((s) => s.setError);
  const setApplying = useReconcileStore((s) => s.setApplying);
  const toggleOp = useReconcileStore((s) => s.toggleOp);
  const selectAll = useReconcileStore((s) => s.selectAll);
  const selectNone = useReconcileStore((s) => s.selectNone);

  const history = useChatThreads();

  // Drives proposal generation when the modal enters the loading state.
  useSchemaAgentReconcile();

  const schema = useUndoStore((s) => s.schema);
  const filePath = useDocumentStore((s) => s.filePath);

  const displayName = targetPath ? shortPath(targetPath) : 'generated file';
  const targetKind = generatedTargetKindFor(targetPath, filePath);

  // Recompute the would-be emit each time the user toggles an op.
  // Cheap (pure function, < 10ms even on large schemas), so a
  // simple `useMemo` is sufficient — no need to debounce.
  const projection = useMemo(() => {
    if (!targetPath) return { schema, error: null, emit: { source: '', error: 'No target.' } };
    const projected = applySelectedOps(schema, proposedOps, selectedIndices);
    const emit = safeEmitForTarget(projected.schema, targetPath, filePath, targetKind);
    return { ...projected, emit };
  }, [schema, proposedOps, selectedIndices, targetPath, filePath, targetKind]);

  const currentEmit = useMemo(() => {
    if (!targetPath) return { source: '', error: 'No target.' };
    return safeEmitForTarget(schema, targetPath, filePath, targetKind);
  }, [schema, targetPath, filePath, targetKind]);

  const residualLines = useMemo(() => {
    if (onDiskSource === null) return 0;
    if (projection.emit.error) return 0;
    return countResidualLines(projection.emit.source, onDiskSource);
  }, [onDiskSource, projection]);

  const handleApply = useCallback(() => {
    setApplying();
    const undo = useUndoStore.getState();
    undo.begin();
    for (let i = 0; i < proposedOps.length; i += 1) {
      if (!selectedIndices.has(i)) continue;
      const r = undo.apply(proposedOps[i].op);
      if ('error' in r) {
        undo.rollback();
        setError(r.error);
        return;
      }
    }
    undo.commit();
    useDriftStore.getState().setResolved();
    void window.contexture?.drift.dismiss();
    close();
  }, [proposedOps, selectedIndices, setApplying, setError, close]);

  const handleRegenerate = useCallback(() => {
    if (
      !filePath ||
      !targetPath ||
      targetKind === 'unknown' ||
      !currentEmit.source ||
      currentEmit.error
    ) {
      return;
    }
    void window.contexture?.reconcile
      .writeGeneratedTarget({ irPath: filePath, targetPath, contents: currentEmit.source })
      .then(async () => {
        await window.contexture?.drift.check();
        close();
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to overwrite file: ${message}`);
      });
  }, [filePath, targetPath, targetKind, currentEmit, close, setError]);

  const handleOpenInChat = useCallback(() => {
    const irJson = JSON.stringify(schema, null, 2);
    const opsJson = JSON.stringify(proposedOps, null, 2);
    const message = [
      `Help me reconcile a drift in \`${displayName}\`. Context follows.`,
      '',
      '## Current IR',
      '```json',
      irJson,
      '```',
      '',
      `## Hand-edited \`${displayName}\``,
      '```',
      onDiskSource ?? '(unavailable)',
      '```',
      '',
      '## Proposed reconcile ops',
      '```json',
      opsJson,
      '```',
    ].join('\n');

    const storedProvider = localStorage.getItem('contexture-schema-agent-provider');
    const provider =
      window.contexture?.schemaAgent && (storedProvider === 'codex' || storedProvider === 'claude')
        ? storedProvider
        : window.contexture?.schemaAgent
          ? 'codex'
          : 'claude';
    const threadId = history.createThread({
      provider,
      ...(provider === 'claude' ? { model: 'claude-sonnet-4-6' } : {}),
      filePath,
    });
    history.updateThreadMessages(threadId, [
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        createdAt: Date.now(),
      },
    ]);
    useUIChromeStore.getState().setSidebarTab('chat');
    useUIChromeStore.getState().setSidebarVisible(true);
    close();
  }, [schema, proposedOps, onDiskSource, displayName, filePath, history, close]);

  const handleRetry = useCallback(() => {
    setLoading();
  }, [setLoading]);

  const applyDisabled =
    status !== 'ready' || selectedIndices.size === 0 || proposedOps.length === 0;

  const regenerateDisabled =
    !targetPath || targetKind === 'unknown' || !!currentEmit.error || !currentEmit.source;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-6xl w-full">
        <DialogHeader>
          <DialogTitle>Reconcile changes</DialogTitle>
          <DialogDescription>
            <code className="font-mono">{displayName}</code> differs from Contexture's generated
            output. Regenerate it from the current IR, leave it dirty, or use the proposal tools to
            fold changes back into the model.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col border rounded-md overflow-hidden max-h-64">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 text-xs">
              <span className="font-medium">Proposed ops</span>
              {status === 'ready' && proposedOps.length > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="hover:underline"
                    aria-label="Select all ops"
                  >
                    All
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="hover:underline"
                    aria-label="Deselect all ops"
                  >
                    None
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {status === 'loading' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Analysing changes…</span>
                </div>
              )}
              {status === 'error' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <TriangleAlert className="size-4 shrink-0 mt-0.5" />
                    <span>{error ?? 'Something went wrong.'}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleRetry}>
                    Retry
                  </Button>
                </div>
              )}
              {status === 'ready' && proposedOps.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No ops needed — Contexture would already emit the file as it stands on disk.
                </p>
              )}
              {(status === 'ready' || status === 'applying') && proposedOps.length > 0 && (
                <ul className="space-y-2">
                  {proposedOps.map((entry, i) => (
                    <li key={entry.id} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        id={`reconcile-op-${entry.id}`}
                        checked={selectedIndices.has(i)}
                        onCheckedChange={() => toggleOp(i)}
                        aria-label={entry.label}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={`reconcile-op-${entry.id}`}
                        className="flex-1 cursor-pointer leading-tight"
                      >
                        {entry.label}
                      </label>
                      {entry.lossy && <LossyBadge />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col border rounded-md overflow-hidden min-h-[360px]">
            <div className="px-3 py-2 border-b bg-muted/30 text-xs font-medium">
              Diff (Contexture emit ↔ on-disk file)
            </div>
            <div className="flex-1 overflow-auto max-h-[60vh]">
              {status === 'loading' && (
                <p className="p-3 text-sm text-muted-foreground">Loading…</p>
              )}
              {status === 'error' && (
                <p className="p-3 text-sm text-muted-foreground">
                  Diff unavailable until the proposal loads.
                </p>
              )}
              {(status === 'ready' || status === 'applying') &&
                onDiskSource !== null &&
                (projection.emit.error ? (
                  <p className="p-3 text-sm text-destructive">
                    Cannot emit current schema: {projection.emit.error}
                  </p>
                ) : (
                  <MultiFileDiff
                    oldFile={{
                      name: displayName,
                      contents: projection.emit.source,
                      lang: displayName.endsWith('.json') ? 'json' : 'ts',
                    }}
                    newFile={{
                      name: displayName,
                      contents: onDiskSource,
                      lang: displayName.endsWith('.json') ? 'json' : 'ts',
                    }}
                    options={{ diffStyle: 'split', disableFileHeader: true }}
                    disableWorkerPool={true}
                  />
                ))}
            </div>
            {(status === 'ready' || status === 'applying') && onDiskSource !== null && (
              <div className="px-3 py-2 border-t text-xs text-muted-foreground">
                Residual: {residualLines} changed line{residualLines !== 1 ? 's' : ''} not covered
                by selected ops
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Leave dirty
          </Button>
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={regenerateDisabled}
            title="Overwrite this generated file with what Contexture emits from the current IR"
          >
            Regenerate from IR
          </Button>
          <Button
            variant="outline"
            onClick={handleOpenInChat}
            disabled={status !== 'ready' || proposedOps.length === 0}
          >
            Open in chat
          </Button>
          <Button onClick={handleApply} disabled={applyDisabled}>
            Apply selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LossyBadge(): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="text-amber-600 border-amber-400 dark:text-amber-400 dark:border-amber-700 px-1.5 py-0"
            aria-label="Destructive change"
          >
            ⚠
          </Badge>
        </TooltipTrigger>
        <TooltipContent>This change is destructive and may lose data.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
