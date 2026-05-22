/**
 * Model sync IPC bridges the main-side `.contexture.json` watcher to the
 * renderer. This is source-model sync, not generated-target drift.
 */

import {
  appendModelChangeLogEntry,
  buildModelChangeLogEntry,
  IRSchema,
  loadModelChangeLog,
} from '@contexture/core';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  createModelSyncWatcher,
  type ModelSyncEvent,
  type ModelSyncWatcher,
} from '../documents/model-sync-watcher';
import { nodeFsAdapter } from '../documents/node-fs-adapter';
import { assertSafeContextureIrPath } from '../security';
import { IpcString, parseIpcPayload } from './validation';

let activeWatcher: ModelSyncWatcher | null = null;
let activeIrPath: string | null = null;

const WatchPayloadSchema = z
  .object({
    irPath: IpcString,
  })
  .strict();

const SelfWritePayloadSchema = z
  .object({
    irPath: IpcString,
    revision: IpcString,
  })
  .strict();

const AppendChangePayloadSchema = z
  .object({
    irPath: IpcString,
    source: z.enum(['desktop', 'schema_agent', 'reconcile', 'external']),
    reason: z.enum(['op_applied', 'replace_schema', 'external_sync_accepted']),
    before: IRSchema,
    after: IRSchema,
    opKind: z.string().optional(),
    actor: z.string().optional(),
  })
  .strict();

export function registerModelSyncIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('model-sync:watch', (_evt, payload: unknown) => {
    const parsed = parseIpcPayload('model-sync:watch', WatchPayloadSchema, payload);
    const irPath = assertSafeContextureIrPath(parsed.irPath);
    activeWatcher?.stop();
    activeIrPath = irPath;
    activeWatcher = createModelSyncWatcher({
      irPath,
      onEvent: (event) => sendEvent(mainWindow, event),
    });
    activeWatcher.start();
    return { ok: true };
  });

  ipcMain.handle('model-sync:unwatch', () => {
    activeWatcher?.stop();
    activeWatcher = null;
    activeIrPath = null;
    return { ok: true };
  });

  ipcMain.handle('model-sync:check', async () => {
    if (!activeWatcher) return { ok: false };
    await activeWatcher.check();
    return { ok: true };
  });

  ipcMain.handle('model-sync:acknowledge-self-write', (_evt, payload: unknown) => {
    const parsed = parseIpcPayload(
      'model-sync:acknowledge-self-write',
      SelfWritePayloadSchema,
      payload,
    );
    acknowledgeModelSyncSelfWrite(parsed.irPath, parsed.revision);
    return { ok: true };
  });

  ipcMain.handle('model-sync:change-log', async (_evt, payload: unknown) => {
    const parsed = parseIpcPayload('model-sync:change-log', WatchPayloadSchema, payload);
    const irPath = assertSafeContextureIrPath(parsed.irPath);
    return loadModelChangeLog(irPath, nodeFsAdapter);
  });

  ipcMain.handle('model-sync:append-change', async (_evt, payload: unknown) => {
    const parsed = parseIpcPayload('model-sync:append-change', AppendChangePayloadSchema, payload);
    const irPath = assertSafeContextureIrPath(parsed.irPath);
    const entry = buildModelChangeLogEntry({
      irPath,
      source: parsed.source,
      reason: parsed.reason,
      before: parsed.before,
      after: parsed.after,
      ...(parsed.opKind ? { opKind: parsed.opKind } : {}),
      ...(parsed.actor ? { actor: parsed.actor } : {}),
    });
    await appendModelChangeLogEntry({ irPath, fs: nodeFsAdapter, entry });
    return { ok: true, entry };
  });
}

export function acknowledgeModelSyncSelfWrite(irPath: string, revision: string): void {
  if (activeIrPath !== irPath) return;
  activeWatcher?.acknowledgeSelfWrite(revision);
}

function sendEvent(mainWindow: BrowserWindow, event: ModelSyncEvent): void {
  mainWindow.webContents.send('model-sync:event', event);
}
