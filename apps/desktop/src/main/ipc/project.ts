/**
 * `registerProjectIpc` — project-lifecycle IPC that doesn't belong in the
 * file/open bundle flow. Currently just a recursive directory delete used
 * by the New Project dialog's "delete and start over" action.
 *
 * The handler trusts the renderer to have confirmed with the user before
 * calling — main is deliberately dumb here. Delete is `force: true` so a
 * partial scaffold (unwritable child files, etc.) still cleans up.
 */
import { lstat, rm } from 'node:fs/promises';
import { ipcMain } from 'electron';
import { assertSafeRecursiveDeleteTarget } from '../security';
import { IpcString, parseIpcPayload } from './validation';

export async function deleteProjectDirectory(path: unknown): Promise<void> {
  const parsedPath = parseIpcPayload('project:delete-directory', IpcString, path);
  const target = assertSafeRecursiveDeleteTarget(parsedPath);
  try {
    const stat = await lstat(target);
    if (!stat.isDirectory()) throw new Error('Delete target must be a directory.');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await rm(target, { recursive: true, force: true });
}

export function registerProjectIpc(): void {
  ipcMain.handle('project:delete-directory', async (_evt, path: unknown) => {
    await deleteProjectDirectory(path);
  });
}
