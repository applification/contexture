/**
 * `useFileMenu` — wires the New / Open / Save / Save-As flow across
 * the menu bar, the empty-state "Load sample" button, and the recent-
 * files list. Lives in a hook (not App.tsx) so the logic has one home
 * and tests can drive it directly.
 *
 * Flow:
 *   - **New**: replace the IR with an empty v1 schema, null the file
 *     path, clear layout + chat sidecars in-memory.
 *   - **Open**: show the OS dialog (or consume the path handed in by a
 *     recent-files click); try `load()`; surface warnings / unknown-
 *     format dialog via `useDocumentStore`; on success, replace the IR
 *     and stash the path.
 *   - **Save**: serialise the IR + sidecars into the five-file bundle
 *     via `file:save`. If validation has errors, prompt first
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
import { DEFAULT_CHAT_HISTORY } from '../model/chat-history';
import { load } from '../model/load';
import { STDLIB_REGISTRY } from '../services/stdlib-registry';
import { validate } from '../services/validation';
import { useDocumentStore } from '../store/document';
import { useUndoStore } from '../store/undo';

function genId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `save-${Date.now()}-${Math.random()}`;
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

export function useFileMenu(): UseFileMenuReturn {
  const fileApi = typeof window !== 'undefined' ? window.contexture?.file : undefined;

  const handleNew = useCallback((): void => {
    useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
    const doc = useDocumentStore.getState();
    doc.setFilePath(null);
    doc.markClean();
  }, []);

  const applyLoaded = useCallback((rawContent: string, filePath: string): void => {
    const doc = useDocumentStore.getState();
    try {
      const { schema, warnings } = load(rawContent);
      useUndoStore.getState().apply({ kind: 'replace_schema', schema });
      doc.setFilePath(filePath);
      doc.markClean();
      if (warnings.length > 0) {
        doc.showImportWarnings(warnings.map((message) => ({ message, severity: 'warning' })));
      }
    } catch {
      doc.showUnknownFormat(filePath);
    }
  }, []);

  const handleOpen = useCallback(async (): Promise<void> => {
    if (!fileApi) return;
    const opened = await fileApi.openDialog();
    if (!opened) return;
    applyLoaded(opened.content, opened.irPath);
  }, [fileApi, applyLoaded]);

  const handleOpenPath = useCallback(
    async (path: string): Promise<void> => {
      if (!fileApi) return;
      const opened = await fileApi.openRecent(path);
      if (!opened) return;
      applyLoaded(opened.content, opened.irPath);
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
      await writeBundle(fileApi, irPath);
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
      await writeBundle(fileApi, irPath);
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
): Promise<void> {
  const schema = useUndoStore.getState().schema;
  await fileApi.save({
    irPath,
    schema,
    // Placeholders — layout + chat sidecars are still owned by other
    // hooks that will be wired in later. The atomic save already writes
    // all five files, so sending defaults keeps the bundle structure
    // intact.
    layout: { version: '1' as const, positions: {} },
    chat: DEFAULT_CHAT_HISTORY,
  });
  const doc = useDocumentStore.getState();
  doc.setFilePath(irPath);
  doc.markClean();
}
