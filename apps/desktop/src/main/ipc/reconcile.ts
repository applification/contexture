import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ipcMain } from 'electron';
import { z } from 'zod';
import { assertGeneratedTargetForIr } from '../security';
import { IpcString, parseIpcPayload } from './validation';

export interface GeneratedTargetInput {
  irPath: string;
  targetPath: string;
}

export interface WriteGeneratedTargetInput extends GeneratedTargetInput {
  contents: string;
}

const GeneratedTargetInputSchema = z
  .object({
    irPath: IpcString,
    targetPath: IpcString,
  })
  .strict();

const WriteGeneratedTargetInputSchema = GeneratedTargetInputSchema.extend({
  contents: z.string(),
}).strict();

export async function readGeneratedTarget(input: unknown): Promise<string | null> {
  const parsed = parseIpcPayload(
    'reconcile:read-generated-target',
    GeneratedTargetInputSchema,
    input,
  );
  const target = assertGeneratedTargetForIr(parsed.irPath, parsed.targetPath);
  try {
    return await readFile(target, 'utf8');
  } catch {
    return null;
  }
}

export async function writeGeneratedTarget(input: unknown): Promise<void> {
  const parsed = parseIpcPayload(
    'reconcile:write-generated-target',
    WriteGeneratedTargetInputSchema,
    input,
  );
  const target = assertGeneratedTargetForIr(parsed.irPath, parsed.targetPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, parsed.contents, 'utf8');
}

export function registerReconcileIpc(): void {
  ipcMain.handle('reconcile:read-generated-target', async (_evt, input: unknown) =>
    readGeneratedTarget(input),
  );
  ipcMain.handle('reconcile:write-generated-target', async (_evt, input: unknown) =>
    writeGeneratedTarget(input),
  );
}
