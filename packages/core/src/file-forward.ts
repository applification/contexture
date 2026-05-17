import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type GeneratedBundleFs, writeGeneratedBundle } from './generated-bundle-writer';
import { load } from './load';
import { type ApplyResult, apply, type Op } from './ops';
import { assertWritableContextureProjectIrPath } from './paths';

export interface FileBackedFs extends GeneratedBundleFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
}

export const nodeFileBackedFs: FileBackedFs = {
  readFile: (path) => readFile(path, 'utf8'),
  async writeFile(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  },
  rename: async (from, to) => {
    const fs = await import('node:fs/promises');
    await mkdir(dirname(to), { recursive: true });
    await fs.rename(from, to);
  },
  remove: (path) => rm(path, { force: true }),
  mkdirp: (path) => mkdir(path, { recursive: true }).then(() => undefined),
};

export function createFileBackedForward(irPath: string, fs: FileBackedFs = nodeFileBackedFs) {
  const resolvedIrPath = assertWritableContextureProjectIrPath(irPath);

  return async function forward(op: Op): Promise<ApplyResult> {
    const raw = await fs.readFile(resolvedIrPath);
    const { schema } = load(raw);
    const result = apply(schema, op);
    if ('error' in result) return result;

    await writeGeneratedBundle({ irPath: resolvedIrPath, schema: result.schema, fs });
    return result;
  };
}
