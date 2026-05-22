import { useEffect } from 'react';
import { changeLogEntryFromAppendResult, useChangesStore } from '../store/changes';
import { useDocumentStore } from '../store/document';
import { subscribeUndoMutations } from '../store/undo';

export function useModelChangeLogRecorder(): void {
  useEffect(() => {
    return subscribeUndoMutations((event) => {
      if (event.meta.log === false) return;
      const filePath = useDocumentStore.getState().filePath;
      if (!filePath) return;
      const api = window.contexture?.modelSync;
      if (!api) return;
      void api
        .appendChange({
          irPath: filePath,
          source: event.meta.source ?? 'desktop',
          reason: event.op.kind === 'replace_schema' ? 'replace_schema' : 'op_applied',
          before: event.before,
          after: event.after,
          opKind: event.op.kind,
          ...(event.meta.actor ? { actor: event.meta.actor } : {}),
        })
        .then((result) => {
          const entry = changeLogEntryFromAppendResult(result);
          if (!entry || entry.irPath !== useDocumentStore.getState().filePath) return;
          useChangesStore.getState().recordEntry(entry);
        })
        .catch(() => undefined);
    });
  }, []);
}
