import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { load, save } from './load';
import { type ApplyResult, apply, type Op } from './ops';
import { bundlePathsFor, type FileEntry, runEmitPipeline } from './pipeline';

export interface FileBackedFs {
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

async function writeBundleAtomic(fs: FileBackedFs, files: ReadonlyArray<FileEntry>): Promise<void> {
  interface Snapshot {
    path: string;
    existed: boolean;
    prior?: string;
    renamed: boolean;
  }

  const snapshots: Snapshot[] = [];
  try {
    for (const file of files) {
      const snap: Snapshot = { path: file.path, existed: false, renamed: false };
      try {
        snap.prior = await fs.readFile(file.path);
        snap.existed = true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      snapshots.push(snap);

      const tmp = `${file.path}.tmp`;
      await fs.writeFile(tmp, file.content);
      await fs.rename(tmp, file.path);
      snap.renamed = true;
    }
  } catch (err) {
    for (const snap of snapshots.slice().reverse()) {
      if (snap.renamed) {
        if (snap.existed && snap.prior !== undefined) {
          await fs.writeFile(snap.path, snap.prior).catch(() => undefined);
        } else {
          await fs.remove(snap.path).catch(() => undefined);
        }
      }
      await fs.remove(`${snap.path}.tmp`).catch(() => undefined);
    }
    throw err;
  }
}

export function createFileBackedForward(irPath: string, fs: FileBackedFs = nodeFileBackedFs) {
  const resolvedIrPath = resolve(irPath);

  return async function forward(op: Op): Promise<ApplyResult> {
    // TODO(#160): run drift pre-flight before writing generated artefacts.
    const raw = await fs.readFile(resolvedIrPath);
    const { schema } = load(raw);
    const result = apply(schema, op);
    if ('error' in result) return result;

    const paths = bundlePathsFor(resolvedIrPath);
    await fs.mkdirp(dirname(paths.emitted));
    await fs.mkdirp(dirname(paths.convex));

    const { emitted, manifest } = runEmitPipeline(result.schema, resolvedIrPath);
    const files: FileEntry[] = [
      { path: paths.ir, content: `${save(result.schema)}\n` },
      ...emitted,
      { path: paths.emitted, content: `${JSON.stringify(manifest, null, 2)}\n` },
    ];
    await writeBundleAtomic(fs, files);
    return result;
  };
}
