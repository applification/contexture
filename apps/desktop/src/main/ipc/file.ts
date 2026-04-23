/**
 * File open/save IPC — thin glue between Electron's dialogs/menu
 * channels and the `DocumentStore`. The store owns atomicity, emit,
 * recent-files; this file only translates IPC payloads into store
 * calls.
 *
 * Handlers are exported alongside `registerFileIpc` so vitest can
 * drive them directly without booting Electron.
 */

import { join } from 'node:path';
import type { ChatHistory } from '@renderer/model/chat-history';
import type { Schema } from '@renderer/model/ir';
import type { Layout } from '@renderer/model/layout';
import { app, type BrowserWindow, dialog, type FileFilter, ipcMain } from 'electron';
import { createDocumentStore, type DocumentStore } from '../documents/document-store';
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

export interface HandleOpenResult {
  irPath: string;
  content: string;
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
 * Read a `.contexture.json` file's raw text from disk.
 *
 * Kept for the preload bridge's `read` hook (which hands raw JSON back
 * to the renderer's `load()`). The renderer uses the full DocumentStore
 * via IPC for opens that should also hydrate sidecars + recents.
 */
export async function handleOpen(irPath: string): Promise<HandleOpenResult> {
  const { promises: fs } = await import('node:fs');
  const content = await fs.readFile(irPath, 'utf-8');
  return { irPath, content };
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
    // `open` via the DocumentStore would also bump recents, but the
    // renderer's `file:open-dialog` path only returns raw content and
    // lets the renderer call `load()` itself (keeping parse errors in
    // the UI). We bump recents separately in `file:save` /
    // `file:open-recent`.
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
    const exists = await nodeFsAdapter.fileExists(filePath);
    if (!exists) return null;
    return handleOpen(filePath);
  });
}
