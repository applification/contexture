import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ipcMain } from 'electron';
import { assertGeneratedTargetForIr } from '../security';

export interface GeneratedTargetInput {
  irPath: string;
  targetPath: string;
}

export interface WriteGeneratedTargetInput extends GeneratedTargetInput {
  contents: string;
}

export async function readGeneratedTarget(input: GeneratedTargetInput): Promise<string | null> {
  const target = assertGeneratedTargetForIr(input.irPath, input.targetPath);
  try {
    return await readFile(target, 'utf8');
  } catch {
    return null;
  }
}

export async function writeGeneratedTarget(input: WriteGeneratedTargetInput): Promise<void> {
  const target = assertGeneratedTargetForIr(input.irPath, input.targetPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, input.contents, 'utf8');
}

export function registerReconcileIpc(): void {
  ipcMain.handle('reconcile:read-generated-target', async (_evt, input: GeneratedTargetInput) =>
    readGeneratedTarget(input),
  );
  ipcMain.handle(
    'reconcile:write-generated-target',
    async (_evt, input: WriteGeneratedTargetInput) => writeGeneratedTarget(input),
  );
}
