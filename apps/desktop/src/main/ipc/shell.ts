/**
 * `registerShellIpc` — tiny wrapper around Electron's `shell.showItemInFolder`
 * so the renderer can reveal a scaffolded project (or its log file) in the
 * OS file manager. Kept separate so the success / failure views can reach
 * the same IPC channel.
 */
import { ipcMain, shell } from 'electron';

export function registerShellIpc(): void {
  ipcMain.handle('shell:reveal', (_evt, path: string) => {
    shell.showItemInFolder(path);
  });
  ipcMain.handle('shell:open-in-editor', async (_evt, path: string) => {
    await shell.openExternal(`vscode://file${path}`);
  });
}
