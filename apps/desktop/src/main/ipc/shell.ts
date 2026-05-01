import { spawn } from 'node:child_process';
import { ipcMain, shell } from 'electron';

export type CliRunner = (args: readonly string[]) => Promise<void>;

export async function openInEditor(path: string, runCli: CliRunner): Promise<void> {
  try {
    await runCli(['--new-window', path]);
  } catch {
    await shell.openExternal(`vscode://file${path}`);
  }
}

function spawnCode(args: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('code', [...args], { detached: true, stdio: 'ignore' });
    proc.on('error', reject);
    proc.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`code exited with ${exitCode ?? 'signal'}`));
      }
    });
    proc.unref();
  });
}

export function registerShellIpc(): void {
  ipcMain.handle('shell:reveal', (_evt, path: string) => {
    shell.showItemInFolder(path);
  });
  ipcMain.handle('shell:open-in-editor', async (_evt, path: string) => {
    await openInEditor(path, spawnCode);
  });
}
