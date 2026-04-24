/**
 * `useProjectAutoSave` — debounced auto-save for project-mode documents.
 *
 * In project mode the document lives in a scaffolded monorepo where
 * emitted artefacts (`schema.ts`, the Zod mirror, CLAUDE.md, …) have to
 * stay in sync with the IR. Every IR edit flushes to disk 500ms after
 * the last change so downstream tools see a recent bundle without the
 * user hitting Cmd-S.
 *
 * Scratch mode stays on the classic manual-save flow — editing a bare
 * `.contexture.json` anywhere on disk must not silently clobber the
 * user's file.
 */
import { useEffect, useRef } from 'react';
import type { ChatHistory } from '../model/chat-history';
import type { Layout } from '../model/layout';
import { useDocumentStore } from '../store/document';
import { useUndoStore } from '../store/undo';

const DEBOUNCE_MS = 500;

const DEFAULT_LAYOUT: Layout = { version: '1', positions: {} };
const DEFAULT_CHAT: ChatHistory = { version: '1', messages: [] };

export interface UseProjectAutoSaveOptions {
  getLayout?: () => Layout;
  getChat?: () => ChatHistory;
}

export function useProjectAutoSave(options: UseProjectAutoSaveOptions = {}): void {
  const fileApi = typeof window !== 'undefined' ? window.contexture?.file : undefined;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!fileApi) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSchema = useUndoStore.getState().schema;

    const flush = (): void => {
      timer = null;
      const doc = useDocumentStore.getState();
      if (doc.mode !== 'project' || !doc.filePath) return;
      const schema = useUndoStore.getState().schema;
      const layout = optionsRef.current.getLayout?.() ?? DEFAULT_LAYOUT;
      const chat = optionsRef.current.getChat?.() ?? DEFAULT_CHAT;
      void fileApi
        .save({ irPath: doc.filePath, schema, layout, chat })
        .then(() => useDocumentStore.getState().markClean());
    };

    const unsub = useUndoStore.subscribe((s) => {
      if (s.schema === lastSchema) return;
      lastSchema = s.schema;
      const doc = useDocumentStore.getState();
      if (doc.mode !== 'project' || !doc.filePath) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timer !== null) clearTimeout(timer);
    };
  }, [fileApi]);
}
