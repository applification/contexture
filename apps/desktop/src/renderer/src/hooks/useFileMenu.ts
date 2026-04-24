/**
 * `useFileMenu` — wires the New / Open / Save / Save-As flow across
 * the menu bar, the empty-state "Load sample" button, and the recent-
 * files list. Lives in a hook (not App.tsx) so the logic has one home
 * and tests can drive it directly.
 *
 * Flow:
 *   - **New**: replace the IR with an empty v1 schema, null the file
 *     path, clear layout + chat sidecars in-memory via the provided
 *     `onNew` callback (so App can reset positions + chat).
 *   - **Open**: show the OS dialog (or consume the path handed in by a
 *     recent-files click); try `load()`; surface warnings / unknown-
 *     format dialog via `useDocumentStore`; on success, replace the IR,
 *     stash the path, and hand layout + chat to `onBundleLoaded` so
 *     App can rehydrate canvas positions + chat transcript.
 *   - **Save**: serialise the IR + sidecars (pulled from the injected
 *     `getLayout` / `getChat` getters) into the five-file bundle via
 *     `file:save`. If validation has errors, prompt first
 *     (`saveWithErrorsPrompt`) and only save when the user confirms
 *     via the dialog's `Save anyway` path (`forceSave`).
 *   - **Save As**: run the OS save-as dialog, then fall through to the
 *     regular save path.
 *
 * The hook mounts once and returns imperative functions; the caller
 * wires `onMenuNew` / `onMenuOpen` / `onMenuSave` / `onMenuSaveAs`
 * subscriptions in a single `useEffect`.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { ChatHistory } from '../model/chat-history';
import type { Layout } from '../model/layout';
import { load } from '../model/load';
import { STDLIB_REGISTRY } from '../services/stdlib-registry';
import { validate } from '../services/validation';
import { useDocumentStore } from '../store/document';
import { useUndoStore } from '../store/undo';

function genId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `save-${Date.now()}-${Math.random()}`;
}

export interface UseFileMenuOptions {
  /** Snapshot of current canvas layout — called on every save. */
  getLayout?: () => Layout;
  /** Snapshot of current chat transcript — called on every save. */
  getChat?: () => ChatHistory;
  /** Rehydrate callback run after a successful open. */
  onBundleLoaded?: (bundle: { layout: Layout; chat: ChatHistory }) => void;
  /** Reset callback for New — called before the empty IR replaces state. */
  onNew?: () => void;
}

export interface UseFileMenuReturn {
  handleNew: () => void;
  handleOpen: () => Promise<void>;
  handleOpenPath: (path: string) => Promise<void>;
  handleSave: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
  /** Used by `DocumentDialogs.onForceSave` — save regardless of errors. */
  handleForceSave: (promptId: string) => Promise<void>;
}

const DEFAULT_LAYOUT: Layout = { version: '1', positions: {} };
const DEFAULT_CHAT: ChatHistory = { version: '1', messages: [] };

export function useFileMenu(options: UseFileMenuOptions = {}): UseFileMenuReturn {
  const fileApi = typeof window !== 'undefined' ? window.contexture?.file : undefined;

  // Stash callbacks in refs so the menu-bar effect doesn't re-subscribe
  // every render when the caller passes inline closures.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleNew = useCallback((): void => {
    optionsRef.current.onNew?.();
    useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
    const doc = useDocumentStore.getState();
    doc.setFilePath(null);
    doc.setMode('scratch');
    doc.markClean();
  }, []);

  const applyLoaded = useCallback(
    (opened: {
      content: string;
      irPath: string;
      mode?: 'scratch' | 'project';
      layout?: Layout;
      chat?: ChatHistory;
      warnings?: Array<{ message: string; severity: 'warning' | 'error' }>;
    }): void => {
      const doc = useDocumentStore.getState();
      try {
        const { schema, warnings: irWarnings } = load(opened.content);
        useUndoStore.getState().apply({ kind: 'replace_schema', schema });
        doc.setFilePath(opened.irPath);
        doc.setMode(opened.mode ?? 'scratch');
        doc.markClean();

        optionsRef.current.onBundleLoaded?.({
          layout: opened.layout ?? DEFAULT_LAYOUT,
          chat: opened.chat ?? DEFAULT_CHAT,
        });

        const allWarnings = [
          ...irWarnings.map((message) => ({ message, severity: 'warning' as const })),
          ...(opened.warnings ?? []),
        ];
        if (allWarnings.length > 0) {
          doc.showImportWarnings(allWarnings);
        }
      } catch {
        doc.showUnknownFormat(opened.irPath);
      }
    },
    [],
  );

  const handleOpen = useCallback(async (): Promise<void> => {
    if (!fileApi) return;
    const opened = await fileApi.openDialog();
    if (!opened) return;
    applyLoaded(opened);
  }, [fileApi, applyLoaded]);

  const handleOpenPath = useCallback(
    async (path: string): Promise<void> => {
      if (!fileApi) return;
      const opened = await fileApi.openRecent(path);
      if (!opened) return;
      applyLoaded(opened);
    },
    [fileApi, applyLoaded],
  );

  // Maps a prompt id (from `showSaveWithErrors`) to the target path
  // the user wanted to save to, so `handleForceSave` can complete the
  // save once they click "Save anyway".
  const pendingForceSaveRef = useRef<Map<string, string>>(new Map());

  // The save path validates first. If there are errors we stash the
  // target path under a fresh prompt id and ask the user; `Save
  // anyway` comes back through `handleForceSave`.
  const saveTo = useCallback(
    async (irPath: string): Promise<void> => {
      if (!fileApi) return;
      const schema = useUndoStore.getState().schema;
      const errors = validate(schema, { stdlib: STDLIB_REGISTRY });
      if (errors.length > 0) {
        const id = genId();
        pendingForceSaveRef.current.set(id, irPath);
        useDocumentStore.getState().showSaveWithErrors({
          id,
          messages: errors.map((e) => e.message),
        });
        return;
      }
      await writeBundle(fileApi, irPath, optionsRef.current);
    },
    [fileApi],
  );

  const handleSave = useCallback(async (): Promise<void> => {
    if (!fileApi) return;
    const { filePath } = useDocumentStore.getState();
    if (filePath) {
      await saveTo(filePath);
      return;
    }
    const chosen = await fileApi.saveAsDialog();
    if (!chosen) return;
    await saveTo(chosen);
  }, [fileApi, saveTo]);

  const handleSaveAs = useCallback(async (): Promise<void> => {
    if (!fileApi) return;
    const chosen = await fileApi.saveAsDialog();
    if (!chosen) return;
    await saveTo(chosen);
  }, [fileApi, saveTo]);

  const handleForceSave = useCallback(
    async (promptId: string): Promise<void> => {
      if (!fileApi) return;
      const irPath = pendingForceSaveRef.current.get(promptId);
      if (!irPath) return;
      pendingForceSaveRef.current.delete(promptId);
      await writeBundle(fileApi, irPath, optionsRef.current);
    },
    [fileApi],
  );

  // Wire the menu bar once on mount. The handlers close over refs, so
  // there's no need to re-subscribe when they change.
  useEffect(() => {
    if (!fileApi) return;
    const unsubs = [
      fileApi.onMenuNew(handleNew),
      fileApi.onMenuOpen(() => void handleOpen()),
      fileApi.onMenuSave(() => void handleSave()),
      fileApi.onMenuSaveAs(() => void handleSaveAs()),
    ];
    return () => {
      for (const fn of unsubs) fn();
    };
  }, [fileApi, handleNew, handleOpen, handleSave, handleSaveAs]);

  // Any schema mutation flips the doc to dirty. `applyLoaded` and
  // `writeBundle` call `markClean()` themselves, so the first schema
  // change after a load/save correctly re-dirties the doc.
  useEffect(() => {
    let lastSchema = useUndoStore.getState().schema;
    return useUndoStore.subscribe((s) => {
      if (s.schema !== lastSchema) {
        lastSchema = s.schema;
        useDocumentStore.getState().markDirty();
      }
    });
  }, []);

  return { handleNew, handleOpen, handleOpenPath, handleSave, handleSaveAs, handleForceSave };
}

async function writeBundle(
  fileApi: NonNullable<Window['contexture']['file']>,
  irPath: string,
  options: UseFileMenuOptions,
): Promise<void> {
  const schema = useUndoStore.getState().schema;
  const layout = options.getLayout?.() ?? DEFAULT_LAYOUT;
  const chat = options.getChat?.() ?? DEFAULT_CHAT;
  await fileApi.save({ irPath, schema, layout, chat });
  const doc = useDocumentStore.getState();
  doc.setFilePath(irPath);
  doc.markClean();
}
