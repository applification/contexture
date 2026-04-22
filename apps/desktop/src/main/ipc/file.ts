/**
 * File open/save IPC for the `.contexture.json` document model.
 *
 * The Electron Open/Save dialogs filter to `.contexture.json`; the actual
 * disk work is a thin wrapper over the pure bundle builder + atomic writer
 * in `../save-bundle.ts`. The handler is exported separately from the
 * `ipcMain.handle` wiring so vitest can drive it directly without booting
 * Electron.
 */

import { promises as fs } from 'node:fs';
import type { ChatHistory } from '@renderer/model/chat-history';
import type { Layout } from '@renderer/model/layout';
import type { Schema } from '@renderer/model/types';
import { type BrowserWindow, dialog, type FileFilter, ipcMain } from 'electron';
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
}
