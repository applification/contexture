/**
 * Drift IPC — registers the main-side watcher lifecycle and bridges
 * drift/resolved events to the renderer via `webContents.send`.
 *
 * Called once at startup from `main/index.ts` alongside the other IPC
 * registrations. The watcher is started/stopped in response to
 * `drift:watch` / `drift:unwatch` IPC messages sent by the renderer
 * when a project-mode document opens or closes.
 *
 * `drift:check` is a one-shot manual re-check (window focus trigger).
 */
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { createDriftWatcher, type DriftWatcher } from '../documents/drift-watcher';

let activeWatcher: DriftWatcher | null = null;

export function registerDriftIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('drift:watch', (_evt, payload: { emittedJsonPath: string }) => {
    activeWatcher?.stop();
    activeWatcher = createDriftWatcher({
      emittedJsonPath: payload.emittedJsonPath,
      onDrift: (paths) => mainWindow.webContents.send('drift:detected', { paths }),
      onResolved: () => mainWindow.webContents.send('drift:resolved'),
    });
    activeWatcher.start();
    return { ok: true };
  });

  ipcMain.handle('drift:unwatch', () => {
    activeWatcher?.stop();
    activeWatcher = null;
    return { ok: true };
  });

  ipcMain.handle('drift:check', async () => {
    if (!activeWatcher) return { ok: false };
    await activeWatcher.check();
    return { ok: true };
  });

  ipcMain.handle('drift:dismiss', () => {
    activeWatcher?.resetDrifted();
    return { ok: true };
  });
}
