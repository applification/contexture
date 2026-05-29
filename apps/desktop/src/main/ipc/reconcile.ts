import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  bundlePathsFor,
  type EmittedManifest,
  hashContent,
  IRSchema,
  type Schema,
  save as saveIR,
  writeGeneratedBundle,
} from '@contexture/core';
import { ipcMain } from 'electron';
import { z } from 'zod';
import { nodeFsAdapter } from '../documents/node-fs-adapter';
import {
  type ConvexCliValidationResult,
  type ExecFileLike,
  validateReconciledConvexProject,
} from '../reconcile/convex-cli-validation';
import { assertGeneratedTargetForIr } from '../security';
import { acknowledgeModelSyncSelfWrite } from './model-sync';
import { IpcString, parseIpcPayload } from './validation';

export interface GeneratedTargetInput {
  irPath: string;
  targetPath: string;
}

export interface WriteGeneratedTargetInput extends GeneratedTargetInput {
  contents: string;
}

export interface AcceptGeneratedTargetInput extends WriteGeneratedTargetInput {
  schema: Schema;
}

interface ConvexValidationDeps {
  execFile?: ExecFileLike;
  env?: NodeJS.ProcessEnv;
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

const AcceptGeneratedTargetInputSchema = WriteGeneratedTargetInputSchema.extend({
  schema: IRSchema,
}).strict() as z.ZodType<AcceptGeneratedTargetInput>;

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
  const manifestPath = bundlePathsFor(parsed.irPath).emitted;
  await writeGeneratedTargetContents(target, manifestPath, parsed.contents);
}

export async function acceptGeneratedTarget(input: unknown): Promise<void> {
  const parsed = parseIpcPayload(
    'reconcile:accept-generated-target',
    AcceptGeneratedTargetInputSchema,
    input,
  );
  const target = assertGeneratedTargetForIr(parsed.irPath, parsed.targetPath);
  const manifestPath = bundlePathsFor(parsed.irPath).emitted;
  const previousTarget = await readOptionalFile(target);
  const previousManifest = await readOptionalFile(manifestPath);

  try {
    await writeGeneratedTargetContents(target, manifestPath, parsed.contents);
    acknowledgeModelSyncSelfWrite(parsed.irPath, hashContent(`${saveIR(parsed.schema)}\n`));
    await writeGeneratedBundle({
      irPath: parsed.irPath,
      schema: parsed.schema,
      fs: nodeFsAdapter,
    });
  } catch (err) {
    await restoreOptionalFile(target, previousTarget);
    await restoreOptionalFile(manifestPath, previousManifest);
    throw err;
  }
}

export async function validateConvexGeneratedTarget(
  input: unknown,
  deps: ConvexValidationDeps = {},
): Promise<ConvexCliValidationResult> {
  const parsed = parseIpcPayload(
    'reconcile:validate-convex-generated-target',
    GeneratedTargetInputSchema,
    input,
  );
  assertGeneratedTargetForIr(parsed.irPath, parsed.targetPath);
  return validateReconciledConvexProject(
    { irPath: parsed.irPath, targetPath: parsed.targetPath },
    deps,
  );
}

async function writeGeneratedTargetContents(
  target: string,
  manifestPath: string,
  contents: string,
): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
  await writeGeneratedManifestHash(manifestPath, target, contents);
}

async function writeGeneratedManifestHash(
  manifestPath: string,
  targetPath: string,
  contents: string,
): Promise<void> {
  const manifest = await readGeneratedManifest(manifestPath);
  manifest.files[targetPath] = hashContent(contents);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function readGeneratedManifest(manifestPath: string): Promise<EmittedManifest> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<EmittedManifest>;
    return {
      version: '1',
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
    };
  } catch {
    return { version: '1', files: {} };
  }
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function restoreOptionalFile(path: string, contents: string | null): Promise<void> {
  if (contents === null) {
    await nodeFsAdapter.remove(path).catch(() => undefined);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

export function registerReconcileIpc(): void {
  ipcMain.handle('reconcile:read-generated-target', async (_evt, input: unknown) =>
    readGeneratedTarget(input),
  );
  ipcMain.handle('reconcile:write-generated-target', async (_evt, input: unknown) =>
    writeGeneratedTarget(input),
  );
  ipcMain.handle('reconcile:accept-generated-target', async (_evt, input: unknown) =>
    acceptGeneratedTarget(input),
  );
  ipcMain.handle('reconcile:validate-convex-generated-target', async (_evt, input: unknown) =>
    validateConvexGeneratedTarget(input),
  );
}
