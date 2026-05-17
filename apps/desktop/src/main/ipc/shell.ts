import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ipcMain, shell } from 'electron';
import { IpcString, parseIpcPayload } from './validation';

export type CliRunner = (args: readonly string[]) => Promise<void>;

export async function openInEditor(path: string, runCli: CliRunner): Promise<void> {
  const safePath = assertSafeShellPath(path);
  try {
    await runCli(['--new-window', safePath]);
  } catch {
    await shell.openExternal(toVscodeFileUrl(safePath));
  }
}

export function assertSafeShellPath(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0 || path.includes('\0') || !isAbsolute(path)) {
    throw new Error('Shell paths must be non-empty absolute paths.');
  }
  return path;
}

function toVscodeFileUrl(path: string): string {
  return `vscode://file${pathToFileURL(path).pathname}`;
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
  ipcMain.handle('shell:reveal', (_evt, path: unknown) => {
    shell.showItemInFolder(assertSafeShellPath(parseIpcPayload('shell:reveal', IpcString, path)));
  });
  ipcMain.handle('shell:open-in-editor', async (_evt, path: unknown) => {
    await openInEditor(parseIpcPayload('shell:open-in-editor', IpcString, path), spawnCode);
  });
}
