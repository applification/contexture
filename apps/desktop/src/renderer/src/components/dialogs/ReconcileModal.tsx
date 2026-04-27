/**
 * `ReconcileModal` — drift reconciliation surface (issue #126).
 *
 * Opens from `DriftBanner`'s "Review changes" button when the watched
 * `convex/schema.ts` has been hand-edited. Two-pane layout:
 *
 *   - Left: LLM-proposed op checklist (each row = one IR op).
 *     Toggling a row re-renders the right pane.
 *   - Right: `@pierre/diffs` split view between the Contexture emit
 *     of (current IR + selected ops) and the user's edited file on
 *     disk, with a residual changed-line count underneath.
 *
 * Apply selected → run checked ops through the undo store as one
 * transaction, mark drift resolved, close. Open in chat → seed a new
 * chat thread with IR + Convex source + proposed ops. Cancel → leave
 * drift state alone.
 */
import { MultiFileDiff } from '@pierre/diffs/react';
import { useChatThreads } from '@renderer/chat/useChatThreads';
import { useClaudeReconcile } from '@renderer/hooks/useClaudeReconcile';
import { emitConvexSchema } from '@renderer/model/emit-convex';
import type { Schema } from '@renderer/model/ir';
import { useDocumentStore } from '@renderer/store/document';
import { useDriftStore } from '@renderer/store/drift';
import { apply } from '@renderer/store/ops';
import { type ReconcileOp, useReconcileStore } from '@renderer/store/reconcile';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { useUndoStore } from '@renderer/store/undo';
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

function safeEmit(schema: Schema): EmitResult {
  try {
    return { source: emitConvexSchema(schema), error: null };
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
    const result = apply(next, proposedOps[i].op);
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

export function ReconcileModal(): React.JSX.Element {
  const isOpen = useReconcileStore((s) => s.isOpen);
  const status = useReconcileStore((s) => s.status);
  const proposedOps = useReconcileStore((s) => s.proposedOps);
  const selectedIndices = useReconcileStore((s) => s.selectedIndices);
  const error = useReconcileStore((s) => s.error);
  const convexSource = useReconcileStore((s) => s.convexSource);
  const close = useReconcileStore((s) => s.close);
  const setLoading = useReconcileStore((s) => s.setLoading);
  const setError = useReconcileStore((s) => s.setError);
  const setApplying = useReconcileStore((s) => s.setApplying);
  const toggleOp = useReconcileStore((s) => s.toggleOp);
  const selectAll = useReconcileStore((s) => s.selectAll);
  const selectNone = useReconcileStore((s) => s.selectNone);

  const history = useChatThreads();

  // Drives the Claude query when the modal enters the loading state.
  useClaudeReconcile();

  const schema = useUndoStore((s) => s.schema);

  // Recompute the would-be Convex emit each time the user toggles an
  // op. Cheap (pure function, < 10ms even on large schemas), so a
  // simple `useMemo` is sufficient — no need to debounce.
  const projection = useMemo(() => {
    const projected = applySelectedOps(schema, proposedOps, selectedIndices);
    const emit = safeEmit(projected.schema);
    return { ...projected, emit };
  }, [schema, proposedOps, selectedIndices]);

  const residualLines = useMemo(() => {
    if (convexSource === null) return 0;
    if (projection.emit.error) return 0;
    return countResidualLines(projection.emit.source, convexSource);
  }, [convexSource, projection]);

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

  const handleOpenInChat = useCallback(() => {
    const filePath = useDocumentStore.getState().filePath;
    const irJson = JSON.stringify(schema, null, 2);
    const opsJson = JSON.stringify(proposedOps, null, 2);
    const message = [
      'Help me reconcile a Convex schema drift. Context follows.',
      '',
      '## Current IR',
      '```json',
      irJson,
      '```',
      '',
      '## Hand-edited convex/schema.ts',
      '```ts',
      convexSource ?? '(unavailable)',
      '```',
      '',
      '## Proposed reconcile ops',
      '```json',
      opsJson,
      '```',
    ].join('\n');

    const threadId = history.createThread('claude-sonnet-4-6', filePath);
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
  }, [schema, proposedOps, convexSource, history, close]);

  const handleRetry = useCallback(() => {
    setLoading();
  }, [setLoading]);

  const applyDisabled =
    status !== 'ready' || selectedIndices.size === 0 || proposedOps.length === 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-6xl w-full">
        <DialogHeader>
          <DialogTitle>Reconcile schema changes</DialogTitle>
          <DialogDescription>
            <code className="font-mono">convex/schema.ts</code> was edited outside Contexture.
            Select the ops to bring the IR in line with the file, or open the proposal in chat for
            iteration.
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
                convexSource !== null &&
                (projection.emit.error ? (
                  <p className="p-3 text-sm text-destructive">
                    Cannot emit current schema: {projection.emit.error}
                  </p>
                ) : (
                  <MultiFileDiff
                    oldFile={{
                      name: 'schema.ts',
                      contents: projection.emit.source,
                      lang: 'ts',
                    }}
                    newFile={{ name: 'schema.ts', contents: convexSource, lang: 'ts' }}
                    options={{ diffStyle: 'split', disableFileHeader: true }}
                    disableWorkerPool={true}
                  />
                ))}
            </div>
            {(status === 'ready' || status === 'applying') && convexSource !== null && (
              <div className="px-3 py-2 border-t text-xs text-muted-foreground">
                Residual: {residualLines} changed line{residualLines !== 1 ? 's' : ''} not covered
                by selected ops
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
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
