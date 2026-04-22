/**
 * File open/save IPC for the `.contexture.json` document model.
 *
 * The Electron Open/Save dialogs filter to `.contexture.json`; the actual
 * disk work is a thin wrapper over the pure bundle builder + atomic writer
 * in `../save-bundle.ts`. Handlers are exported separately from the
 * `ipcMain.handle` wiring so vitest can drive them directly without
 * booting Electron.
 *
 * Recent files (`recent-files.json` under `app.getPath('userData')`) are
 * maintained by `addRecentFile` / `loadRecentFiles`. Opening via dialog
 * or via the recent-files menu both prepend the resulting path; save
 * does the same so the latest-saved file is always the top of the
 * jump-list.
 */

import { existsSync, promises as fs, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatHistory } from '@renderer/model/chat-history';
import type { Layout } from '@renderer/model/layout';
import type { Schema } from '@renderer/model/types';
import { app, type BrowserWindow, dialog, type FileFilter, ipcMain } from 'electron';
import { type BuildSaveBundleInput, buildSaveBundle, writeBundleAtomic } from '../save-bundle';

export const CONTEXTURE_OPEN_FILTER: FileFilter = {
  name: 'Contexture Schema',
  extensions: ['contexture.json'],
};

export const CONTEXTURE_SAVE_FILTER: FileFilter = CONTEXTURE_OPEN_FILTER;

export interface HandleSaveInput extends BuildSaveBundleInput {}

export interface HandleOpenResult {
  irPath: string;
  content: string;
}

/** Build the five-file bundle for `input` and write it atomically. */
export async function handleSave(input: HandleSaveInput): Promise<void> {
  const bundle = buildSaveBundle(input);
  await writeBundleAtomic(bundle);
}

/** Read a `.contexture.json` file's raw text from disk. */
export async function handleOpen(irPath: string): Promise<HandleOpenResult> {
  const content = await fs.readFile(irPath, 'utf-8');
  return { irPath, content };
}

const MAX_RECENT = 10;

function recentFilesPath(): string {
  return join(app.getPath('userData'), 'recent-files.json');
}

function loadRecentFiles(): string[] {
  const path = recentFilesPath();
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f): f is string => typeof f === 'string');
  } catch {
    return [];
  }
}

function addRecentFile(filePath: string): void {
  const recent = loadRecentFiles().filter((f) => f !== filePath);
  recent.unshift(filePath);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  try {
    writeFileSync(recentFilesPath(), JSON.stringify(recent), 'utf-8');
    app.addRecentDocument(filePath);
  } catch {
    // Silently swallow — a failing recent-files write shouldn't block
    // the actual open/save operation the user just performed.
  }
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
    const opened = await handleOpen(result.filePaths[0]);
    addRecentFile(opened.irPath);
    return opened;
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
      addRecentFile(payload.irPath);
    },
  );

  ipcMain.handle('file:read', async (_evt, irPath: string) => handleOpen(irPath));

  ipcMain.handle('file:recent-files', () => loadRecentFiles());

  ipcMain.handle('file:open-recent', async (_evt, filePath: string) => {
    if (!existsSync(filePath)) {
      // File moved or deleted since it was added — drop from the list.
      const pruned = loadRecentFiles().filter((f) => f !== filePath);
      try {
        writeFileSync(recentFilesPath(), JSON.stringify(pruned), 'utf-8');
      } catch {
        /* ignore */
      }
      return null;
    }
    const opened = await handleOpen(filePath);
    addRecentFile(filePath);
    return opened;
  });
}
