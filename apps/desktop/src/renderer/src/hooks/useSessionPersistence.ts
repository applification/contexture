import { useEffect, useRef } from 'react';
import type { Schema } from '../model/ir';
import type { Layout } from '../model/layout';
import { useDocumentStore } from '../store/document';
import { useUndoStore } from '../store/undo';

export const SESSION_KEY = 'contexture:session:v1';

interface StoredSession {
  schema: Schema;
  layout: Layout;
}

/** Minimal storage interface — satisfied by `window.localStorage`. */
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface UseSessionPersistenceOptions {
  /** Current canvas layout — read on every debounced save. */
  getLayout: () => Layout;
  /** Called when an unsaved session is restored. */
  onRestoreSession: (layout: Layout) => void;
  /** Storage backend. Defaults to `window.localStorage`. */
  storage?: SessionStorage;
}

export function useSessionPersistence({
  getLayout,
  onRestoreSession,
  storage = typeof window !== 'undefined' ? window.localStorage : undefined,
}: UseSessionPersistenceOptions): void {
  const onRestoreRef = useRef(onRestoreSession);
  onRestoreRef.current = onRestoreSession;
  const getLayoutRef = useRef(getLayout);
  getLayoutRef.current = getLayout;
  const storageRef = useRef(storage);
  storageRef.current = storage;

  // On mount: restore from storage if the schema is empty and no file is open.
  useEffect(() => {
    const store = storageRef.current;
    if (!store) return;
    const schema = useUndoStore.getState().schema;
    if (schema.types.length > 0) return;
    const { filePath } = useDocumentStore.getState();
    if (filePath !== null) return;

    try {
      const raw = store.getItem(SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw) as StoredSession;
      if (!session.schema || session.schema.types.length === 0) return;
      useUndoStore.getState().apply({ kind: 'replace_schema', schema: session.schema });
      onRestoreRef.current(session.layout ?? { version: '1', positions: {} });
    } catch {
      store.removeItem(SESSION_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch schema changes: persist to storage (debounced) when unsaved.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSchema = useUndoStore.getState().schema;

    const flush = (): void => {
      timer = null;
      const store = storageRef.current;
      if (!store) return;
      const { filePath } = useDocumentStore.getState();
      if (filePath !== null) return;
      const schema = useUndoStore.getState().schema;
      if (schema.types.length === 0) {
        store.removeItem(SESSION_KEY);
        return;
      }
      const session: StoredSession = { schema, layout: getLayoutRef.current() };
      try {
        store.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        // Storage full or unavailable (e.g. private browsing quota) — skip silently.
      }
    };

    const unsubSchema = useUndoStore.subscribe((s) => {
      if (s.schema === lastSchema) return;
      lastSchema = s.schema;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, 300);
    });

    // Clear immediately when a file path is set (file open / save-as).
    let lastFilePath = useDocumentStore.getState().filePath;
    const unsubDoc = useDocumentStore.subscribe((s) => {
      if (s.filePath === lastFilePath) return;
      lastFilePath = s.filePath;
      if (s.filePath !== null) {
        storageRef.current?.removeItem(SESSION_KEY);
      }
    });

    return () => {
      unsubSchema();
      unsubDoc();
      if (timer !== null) clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
