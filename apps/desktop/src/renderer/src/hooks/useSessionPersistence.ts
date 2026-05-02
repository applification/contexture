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
  /** Current canvas layout — read on every debounced save and on the
   *  pre-unload flush. Identity-changes also schedule a save so a pure
   *  drag (no schema mutation) still persists. */
  layout: Layout;
  /** Called when an unsaved session is restored. */
  onRestoreSession: (layout: Layout) => void;
  /** Storage backend. Defaults to `window.localStorage`. */
  storage?: SessionStorage;
}

export function useSessionPersistence({
  layout,
  onRestoreSession,
  storage = typeof window !== 'undefined' ? window.localStorage : undefined,
}: UseSessionPersistenceOptions): void {
  const onRestoreRef = useRef(onRestoreSession);
  onRestoreRef.current = onRestoreSession;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
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
  }, []);

  // Persistence loop: schema and layout changes both trigger a debounced
  // write. A `pagehide` listener flushes synchronously so a dev-server
  // restart inside the debounce window doesn't drop the last edit.
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
      const session: StoredSession = { schema, layout: layoutRef.current };
      try {
        store.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        // Storage full or unavailable (e.g. private browsing quota) — skip silently.
      }
    };

    const schedule = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, 300);
    };

    const unsubSchema = useUndoStore.subscribe((s) => {
      if (s.schema === lastSchema) return;
      lastSchema = s.schema;
      schedule();
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

    // Flush synchronously before the renderer goes away. `pagehide` is
    // the reliable Electron equivalent of `beforeunload`; both are
    // wired so a normal close and a dev-server reload both land.
    const onPageHide = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('beforeunload', onPageHide);
    }

    return () => {
      unsubSchema();
      unsubDoc();
      if (timer !== null) clearTimeout(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('beforeunload', onPageHide);
      }
    };
  }, []);

  // Layout-only changes (e.g. a node drag with no schema mutation) also
  // need to land in storage. Schedule a debounced flush whenever the
  // caller-supplied layout reference changes.
  useEffect(() => {
    const store = storageRef.current;
    if (!store) return;
    const { filePath } = useDocumentStore.getState();
    if (filePath !== null) return;
    const schema = useUndoStore.getState().schema;
    if (schema.types.length === 0) return;

    const handle = setTimeout(() => {
      const session: StoredSession = { schema: useUndoStore.getState().schema, layout };
      try {
        store.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        // Quota / private-mode — silent.
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [layout]);
}
