/**
 * File open/save IPC — thin glue between Electron's dialogs/menu
 * channels and the `DocumentStore`. The store owns atomicity, emit,
 * recent-files; this file only translates IPC payloads into store
 * calls.
 *
 * Open paths return a `{ irPath, content, layout, chat, warnings }`
 * shape: raw IR text (so the renderer keeps ownership of IR parse
 * error surfacing) alongside the already-parsed sidecars. Save bumps
 * the recent-files ledger via the store.
 *
 * Handlers are exported alongside `registerFileIpc` so vitest can
 * drive them directly without booting Electron.
 */

import { join } from 'node:path';
import type { ChatHistory } from '@renderer/model/chat-history';
import type { Schema } from '@renderer/model/ir';
import type { Layout } from '@renderer/model/layout';
import { app, type BrowserWindow, dialog, type FileFilter, ipcMain } from 'electron';
import {
  createDocumentStore,
  type DocumentMode,
  type DocumentStore,
} from '../documents/document-store';
import { nodeFsAdapter } from '../documents/node-fs-adapter';

// Electron's FileFilter.extensions is a list of bare extensions (no dot,
// no multi-segment values). The double-extension `.contexture.json` is
// handled via defaultPath; the filter just limits the browser to `.json`
// files so the user sees only candidates.
export const CONTEXTURE_OPEN_FILTER: FileFilter = {
  name: 'Contexture Schema',
  extensions: ['json'],
};

export const CONTEXTURE_SAVE_FILTER: FileFilter = CONTEXTURE_OPEN_FILTER;

export interface HandleSaveInput {
  irPath: string;
  schema: Schema;
  layout: Layout;
  chat: ChatHistory;
}

export interface OpenWarning {
  message: string;
  severity: 'warning' | 'error';
}

export interface OpenResult {
  irPath: string;
  /** `scratch` = bare IR on disk; `project` = `.contexture/` marker present. */
  mode: DocumentMode;
  /** Raw IR text — the renderer calls `load()` to parse + surface errors. */
  content: string;
  /** Pre-parsed layout sidecar (defaults if missing/corrupt). */
  layout: Layout;
  /** Pre-parsed chat sidecar (defaults if missing/corrupt). */
  chat: ChatHistory;
  /** Sidecar warnings (not IR — those come from renderer-side `load()`). */
  warnings: OpenWarning[];
}

let store: DocumentStore | null = null;

function getStore(): DocumentStore {
  if (!store) {
    store = createDocumentStore({
      fs: nodeFsAdapter,
      recentFilesPath: join(app.getPath('userData'), 'recent-files.json'),
      onRecentFileAdded: (path) => app.addRecentDocument(path),
    });
  }
  return store;
}

/** Test/dev override — inject a store built on a non-Node adapter. */
export function setDocumentStoreForTesting(s: DocumentStore | null): void {
  store = s;
}

/** Build the five-file bundle for `input` and write it atomically. */
export async function handleSave(input: HandleSaveInput): Promise<void> {
  await getStore().save(input);
}

/**
 * Read a `.contexture.json` bundle — raw IR text + parsed layout + parsed
 * chat. Returns `null` if the IR file no longer exists (used by the
 * recent-files path to silently prune stale entries).
 */
export async function handleOpen(irPath: string): Promise<OpenResult | null> {
  const s = getStore();
  if (!(await s.fileExists(irPath))) return null;
  const content = await s.readFile(irPath);
  const bundle = await s.open(irPath);
  const warnings: OpenWarning[] = bundle.warnings.map((w) => ({
    message: w.message,
    severity: w.severity,
  }));
  return {
    irPath,
    mode: bundle.mode,
    content,
    layout: bundle.layout,
    chat: bundle.chat,
    warnings,
  };
}

/**
 * Register `ipcMain` handlers for file operations. Call once at app start
 * with the main window so dialogs anchor correctly.
 */
export function registerFileIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Contexture File',
      filters: [CONTEXTURE_OPEN_FILTER],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return handleOpen(result.filePaths[0]);
  });

  ipcMain.handle('file:pick-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Parent Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('file:pick-contexture-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Scratch IR File',
      filters: [CONTEXTURE_OPEN_FILTER],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('file:save-as-dialog', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Contexture File As',
      filters: [CONTEXTURE_SAVE_FILTER],
      defaultPath: 'untitled.contexture.json',
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle(
    'file:save',
    async (
      _evt,
      payload: {
        irPath: string;
        schema: Schema;
        layout: Layout;
        chat: ChatHistory;
      },
    ) => {
      await handleSave(payload);
    },
  );

  ipcMain.handle('file:read', async (_evt, irPath: string) => handleOpen(irPath));

  ipcMain.handle('file:recent-files', async () => {
    const recents = await getStore().recentFiles();
    return recents.map((r) => r.path);
  });

  ipcMain.handle('file:open-recent', async (_evt, filePath: string) => {
    return handleOpen(filePath);
  });
}
