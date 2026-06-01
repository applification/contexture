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

import { readFile as readBinaryFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { ChatHistory, Layout } from '@contexture/core';
import { hashContent, IRSchema, type Schema, save as saveIR } from '@contexture/core';
import {
  CHAT_CONTEXT_MAX_FILE_BYTES,
  CHAT_CONTEXT_MAX_IMAGE_BYTES,
  CHAT_CONTEXT_MAX_TOTAL_BYTES,
  type ChatContextAttachment,
} from '@shared/chat-attachments';
import { app, type BrowserWindow, dialog, type FileFilter, ipcMain } from 'electron';
import { z } from 'zod';
import {
  createDocumentStore,
  type DocumentMode,
  type DocumentStore,
} from '../documents/document-store';
import { nodeFsAdapter } from '../documents/node-fs-adapter';
import { assertSafeContextureIrPath } from '../security';
import { acknowledgeModelSyncSelfWrite } from './model-sync';
import { IpcString, parseIpcPayload } from './validation';

// Electron's FileFilter.extensions is a list of bare extensions (no dot,
// no multi-segment values). The double-extension `.contexture.json` is
// handled via defaultPath; the filter just limits the browser to `.json`
// files so the user sees only candidates.
export const CONTEXTURE_OPEN_FILTER: FileFilter = {
  name: 'Contexture Schema',
  extensions: ['json'],
};

export const CONTEXTURE_SAVE_FILTER: FileFilter = CONTEXTURE_OPEN_FILTER;

export const CHAT_CONTEXT_FILE_FILTER: FileFilter = {
  name: 'Text Files',
  extensions: [
    'txt',
    'md',
    'json',
    'jsonc',
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'css',
    'html',
    'yml',
    'yaml',
    'toml',
    'xml',
    'csv',
  ],
};

export const CHAT_CONTEXT_PHOTO_FILTER: FileFilter = {
  name: 'Images',
  extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
};

type ChatContextPickerKind = 'photos' | 'files';

export interface HandleSaveInput {
  irPath: string;
  schema: Schema;
  layout: Layout;
  chat: ChatHistory;
}

const SavePayloadSchema = z
  .object({
    irPath: IpcString,
    schema: IRSchema,
    layout: z.unknown(),
    chat: z.unknown(),
  })
  .strict() as z.ZodType<HandleSaveInput>;

export interface OpenWarning {
  message: string;
  severity: 'warning' | 'error';
}

export interface OpenResult {
  irPath: string;
  /** Desktop opens legacy bare IRs directly into bundle mode. */
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

export interface PickChatContextFilesDeps {
  showOpenDialog: typeof dialog.showOpenDialog;
  readFile: (path: string) => Promise<string>;
  readBinaryFile?: (path: string) => Promise<Buffer>;
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
  acknowledgeModelSyncSelfWrite(input.irPath, hashContent(`${saveIR(input.schema)}\n`));
  await getStore().save(input);
}

/**
 * Read a `.contexture.json` bundle — raw IR text + parsed layout + parsed
 * chat. Returns `null` if the IR file no longer exists (used by the
 * recent-files path to silently prune stale entries).
 */
export async function handleOpen(irPath: string): Promise<OpenResult | null> {
  const safeIrPath = assertSafeContextureIrPath(irPath);
  const s = getStore();
  if (!(await s.fileExists(safeIrPath))) return null;
  const content = await s.readFile(safeIrPath);
  const bundle = await s.open(safeIrPath);
  const warnings: OpenWarning[] = bundle.warnings.map((w) => ({
    message: w.message,
    severity: w.severity,
  }));
  return {
    irPath: safeIrPath,
    mode: bundle.mode,
    content,
    layout: bundle.layout,
    chat: bundle.chat,
    warnings,
  };
}

export async function handlePickChatContextFiles(
  mainWindow: BrowserWindow,
  deps: PickChatContextFilesDeps = {
    showOpenDialog: dialog.showOpenDialog,
    readFile: (path) => getStore().readFile(path),
    readBinaryFile,
  },
  kind: ChatContextPickerKind = 'files',
): Promise<ChatContextAttachment[]> {
  const isPhotoPicker = kind === 'photos';
  const result = await deps.showOpenDialog(mainWindow, {
    title: isPhotoPicker ? 'Attach Photos to Chat' : 'Attach Files to Chat',
    filters: [isPhotoPicker ? CHAT_CONTEXT_PHOTO_FILTER : CHAT_CONTEXT_FILE_FILTER],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || result.filePaths.length === 0) return [];

  const attachments: ChatContextAttachment[] = [];
  let totalBytes = 0;
  for (const filePath of result.filePaths) {
    if (totalBytes >= CHAT_CONTEXT_MAX_TOTAL_BYTES) break;
    if (isPhotoPicker) {
      const raw = await (deps.readBinaryFile ?? readBinaryFile)(filePath);
      const content = raw.toString('base64');
      const contentBytes = Buffer.byteLength(content, 'utf8');
      if (raw.byteLength > CHAT_CONTEXT_MAX_IMAGE_BYTES) {
        throw new Error(`Image is too large to attach: ${filePath}`);
      }
      if (totalBytes + contentBytes > CHAT_CONTEXT_MAX_TOTAL_BYTES) break;
      totalBytes += contentBytes;
      attachments.push({
        id: `${filePath}:${hashContent(content).slice(0, 12)}`,
        path: filePath,
        name: basename(filePath),
        size: raw.byteLength,
        content,
        kind: 'image',
        mimeType: imageMimeType(filePath),
        encoding: 'base64',
      });
      continue;
    }

    const raw = await deps.readFile(filePath);
    if (raw.includes('\0')) {
      throw new Error(`Cannot attach binary file: ${filePath}`);
    }
    const { content, size, truncated } = trimChatContextContent(
      raw,
      Math.min(CHAT_CONTEXT_MAX_FILE_BYTES, CHAT_CONTEXT_MAX_TOTAL_BYTES - totalBytes),
    );
    totalBytes += size;
    attachments.push({
      id: `${filePath}:${hashContent(content).slice(0, 12)}`,
      path: filePath,
      name: basename(filePath),
      size,
      content,
      kind: 'text',
      ...(truncated ? { truncated: true } : {}),
    });
  }
  return attachments;
}

function imageMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function trimChatContextContent(
  content: string,
  maxBytes: number,
): { content: string; size: number; truncated: boolean } {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes <= maxBytes) return { content, size: bytes, truncated: false };

  let trimmed = content;
  while (Buffer.byteLength(trimmed, 'utf8') > maxBytes && trimmed.length > 0) {
    const excess = Buffer.byteLength(trimmed, 'utf8') - maxBytes;
    trimmed = trimmed.slice(0, Math.max(0, trimmed.length - Math.ceil(excess / 2)));
  }
  return { content: trimmed, size: Buffer.byteLength(trimmed, 'utf8'), truncated: true };
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
      title: 'Choose Contexture File',
      filters: [CONTEXTURE_OPEN_FILTER],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('file:pick-chat-context-files', async (_evt, payload: unknown) => {
    const kind =
      payload && typeof payload === 'object' && (payload as { kind?: unknown }).kind === 'photos'
        ? 'photos'
        : 'files';
    return handlePickChatContextFiles(mainWindow, undefined, kind);
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

  ipcMain.handle('file:save', async (_evt, payload: unknown) => {
    await handleSave(parseIpcPayload('file:save', SavePayloadSchema, payload));
  });

  ipcMain.handle('file:read', async (_evt, irPath: unknown) =>
    handleOpen(parseIpcPayload('file:read', IpcString, irPath)),
  );

  ipcMain.handle('file:recent-files', async () => {
    const recents = await getStore().recentFiles();
    return recents.map((r) => r.path);
  });

  ipcMain.handle('file:open-recent', async (_evt, filePath: unknown) => {
    return handleOpen(parseIpcPayload('file:open-recent', IpcString, filePath));
  });
}
