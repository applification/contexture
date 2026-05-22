/**
 * Mounts source-model sync for the currently open `.contexture.json`.
 *
 * This keeps external MCP/CLI/raw-file edits distinct from generated drift:
 * valid clean source changes update the canvas; unsafe changes become a
 * model-sync attention state.
 */
import { IRSchema, summarizeModelChange } from '@contexture/core';
import { useEffect } from 'react';
import { useDocumentStore } from '../store/document';
import {
  affectedNodeIds,
  noticeFromChange,
  noticeFromSummary,
  type RendererModelSyncEvent,
  useModelSyncStore,
} from '../store/model-sync';
import { useUndoStore } from '../store/undo';

const IR_SUFFIX = '.contexture.json';
const HIGHLIGHT_LIMIT = 8;
const HIGHLIGHT_MS = 5000;
const SYNC_NOTICE_MS = 5000;

export function useModelSync(): void {
  const filePath = useDocumentStore((s) => s.filePath);
  const mode = useDocumentStore((s) => s.mode);

  useEffect(() => {
    const api = window.contexture?.modelSync;
    if (!api) return;

    if (mode !== 'bundle' || !filePath || !filePath.endsWith(IR_SUFFIX)) {
      void api.unwatch();
      useModelSyncStore.getState().clearAttention();
      return;
    }

    void api.watch({ irPath: filePath });

    const unEvent = api.onEvent((event) => handleModelSyncEvent(event as RendererModelSyncEvent));

    function onFocus(): void {
      void api?.check();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      void api.unwatch();
      unEvent();
      window.removeEventListener('focus', onFocus);
    };
  }, [filePath, mode]);
}

export function applyPendingModelSyncEvent(): void {
  const pending = useModelSyncStore.getState().pendingEvent;
  if (!pending) return;
  applyExternalModelEvent(pending);
}

function handleModelSyncEvent(event: RendererModelSyncEvent): void {
  if (event.status !== 'changed') {
    useModelSyncStore.getState().setInvalid(event);
    return;
  }

  const parsed = IRSchema.safeParse(event.schema);
  if (!parsed.success) {
    useModelSyncStore.getState().setInvalid({
      ...event,
      status: 'invalid_ir',
      error: parsed.error.message,
    });
    return;
  }

  const current = useUndoStore.getState().schema;
  const summary = event.change ? null : summarizeModelChange(current, parsed.data);
  const notice = event.change
    ? noticeFromChange(event.change)
    : noticeFromSummary(
        event.source,
        event.observedAt,
        summary ?? summarizeModelChange(current, parsed.data),
      );

  const doc = useDocumentStore.getState();
  const undo = useUndoStore.getState();
  if (doc.isDirty || undo.txDepth > 0) {
    useModelSyncStore.getState().setPending(event, notice);
    return;
  }

  applyExternalModelEvent(event, notice);
}

function applyExternalModelEvent(
  event: RendererModelSyncEvent,
  preparedNotice?: ReturnType<typeof noticeFromChange>,
): void {
  const parsed = IRSchema.safeParse(event.schema);
  if (!parsed.success) {
    useModelSyncStore.getState().setInvalid({
      ...event,
      status: 'invalid_ir',
      error: parsed.error.message,
    });
    return;
  }
  const current = useUndoStore.getState().schema;
  const notice =
    preparedNotice ??
    (event.change
      ? noticeFromChange(event.change)
      : noticeFromSummary(
          event.source,
          event.observedAt,
          summarizeModelChange(current, parsed.data),
        ));

  useModelSyncStore.getState().setSyncing();
  useUndoStore.getState().apply({ kind: 'replace_schema', schema: parsed.data }, { log: false });
  useDocumentStore.getState().markClean();

  const highlighted = affectedNodeIds(notice);
  const shouldHighlight = highlighted.length > 0 && highlighted.length <= HIGHLIGHT_LIMIT;
  useModelSyncStore.getState().setSynced(notice, shouldHighlight ? highlighted : []);

  window.setTimeout(() => useModelSyncStore.getState().clearHighlights(), HIGHLIGHT_MS);
  window.setTimeout(() => {
    const state = useModelSyncStore.getState();
    if (state.status === 'synced' && state.notice?.observedAt === notice.observedAt) {
      useModelSyncStore.getState().clearAttention();
    }
  }, SYNC_NOTICE_MS);
}
