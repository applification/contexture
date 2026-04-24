/**
 * `registerProjectIpc` — project-lifecycle IPC that doesn't belong in the
 * file/open bundle flow. Currently just a recursive directory delete used
 * by the New Project dialog's "delete and start over" action.
 *
 * The handler trusts the renderer to have confirmed with the user before
 * calling — main is deliberately dumb here. Delete is `force: true` so a
 * partial scaffold (unwritable child files, etc.) still cleans up.
 */
import { rm } from 'node:fs/promises';
import { ipcMain } from 'electron';

export function registerProjectIpc(): void {
  ipcMain.handle('project:delete-directory', async (_evt, path: string) => {
    if (typeof path !== 'string' || path === '' || path === '/') return;
    await rm(path, { recursive: true, force: true });
  });
}
