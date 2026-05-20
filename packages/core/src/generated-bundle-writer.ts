import { DEFAULT_CHAT_HISTORY, saveChatHistory } from './chat-history';
import type { Schema } from './ir';
import { DEFAULT_LAYOUT, saveLayout } from './layout';
import { save } from './load';
import { type BundlePaths, bundlePathsFor } from './paths';
import {
  type EmitPipelineDeps,
  type EmittedManifest,
  type FileEntry,
  hashContent,
  runEmitPipeline,
} from './pipeline';

export type GeneratedFileStatus = 'clean' | 'drifted' | 'unreadable';

export interface GeneratedFileCheck {
  path: string;
  status: GeneratedFileStatus;
}

export interface GeneratedBundleFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdirp?(path: string): Promise<void>;
}

export interface GeneratedBundleBuild {
  paths: BundlePaths;
  emitted: FileEntry[];
  manifest: EmittedManifest;
  manifestFile: FileEntry;
}

export interface GeneratedBundleWriteInput {
  irPath: string;
  schema: Schema;
  fs: GeneratedBundleFs;
  emitDeps?: EmitPipelineDeps;
  sidecars?: ReadonlyArray<FileEntry>;
  includeIr?: boolean;
  driftPreflight?: boolean;
  generatedTargetPreflight?: boolean;
}

export interface GeneratedBundleWriteResult extends GeneratedBundleBuild {
  files: FileEntry[];
}

export class GeneratedBundleDriftError extends Error {
  readonly problems: GeneratedFileCheck[];

  constructor(problems: ReadonlyArray<GeneratedFileCheck>) {
    const rendered = problems.map((problem) => `${problem.path} (${problem.status})`).join(', ');
    super(`Generated files have drifted; refusing to overwrite: ${rendered}`);
    this.name = 'GeneratedBundleDriftError';
    this.problems = [...problems];
  }
}

export function buildGeneratedBundle(
  schema: Schema,
  irPath: string,
  emitDeps?: EmitPipelineDeps,
): GeneratedBundleBuild {
  const paths = bundlePathsFor(irPath);
  const { emitted, manifest } = runEmitPipeline(schema, irPath, emitDeps);
  return {
    paths,
    emitted,
    manifest,
    manifestFile: { path: paths.emitted, content: `${JSON.stringify(manifest, null, 2)}\n` },
  };
}

export async function checkGeneratedBundle(
  schema: Schema,
  irPath: string,
  fs: Pick<GeneratedBundleFs, 'readFile'>,
  emitDeps?: EmitPipelineDeps,
): Promise<GeneratedFileCheck[]> {
  const { emitted, manifestFile } = buildGeneratedBundle(schema, irPath, emitDeps);
  const files = [...emitted, manifestFile];
  const checks: GeneratedFileCheck[] = [];

  for (const entry of files) {
    let onDisk: string | undefined;
    try {
      onDisk = await fs.readFile(entry.path);
    } catch {
      onDisk = undefined;
    }

    if (onDisk === undefined) checks.push({ path: entry.path, status: 'unreadable' });
    else if (onDisk !== entry.content) checks.push({ path: entry.path, status: 'drifted' });
    else checks.push({ path: entry.path, status: 'clean' });
  }

  return checks;
}

export async function checkGeneratedManifestDrift(
  irPath: string,
  fs: Pick<GeneratedBundleFs, 'readFile'>,
): Promise<GeneratedFileCheck[]> {
  const paths = bundlePathsFor(irPath);
  let manifest: EmittedManifest;
  try {
    manifest = JSON.parse(await fs.readFile(paths.emitted)) as EmittedManifest;
  } catch {
    return [];
  }

  const checks: GeneratedFileCheck[] = [];
  for (const [path, expectedHash] of Object.entries(manifest.files ?? {})) {
    let content: string | undefined;
    try {
      content = await fs.readFile(path);
    } catch {
      content = undefined;
    }

    if (content === undefined) checks.push({ path, status: 'unreadable' });
    else if (hashContent(content) !== expectedHash) checks.push({ path, status: 'drifted' });
    else checks.push({ path, status: 'clean' });
  }

  return checks;
}

export async function writeGeneratedBundle(
  input: GeneratedBundleWriteInput,
): Promise<GeneratedBundleWriteResult> {
  const {
    irPath,
    schema,
    fs,
    emitDeps,
    sidecars = [],
    includeIr = true,
    driftPreflight = true,
    generatedTargetPreflight = false,
  } = input;

  if (driftPreflight) {
    const drift = (await checkGeneratedManifestDrift(irPath, fs)).filter(
      (check) => check.status !== 'clean',
    );
    if (drift.length > 0) throw new GeneratedBundleDriftError(drift);
  }

  const bundle = buildGeneratedBundle(schema, irPath, emitDeps);
  if (generatedTargetPreflight) {
    const collisions = await checkGeneratedTargetCollisions(bundle.emitted, fs);
    if (collisions.length > 0) throw new GeneratedBundleDriftError(collisions);
  }
  const defaultSidecars = await missingDefaultSidecars(bundle.paths, fs, sidecars);
  const files = [
    ...(includeIr ? [{ path: bundle.paths.ir, content: `${save(schema)}\n` }] : []),
    ...defaultSidecars,
    ...sidecars,
    ...bundle.emitted,
    bundle.manifestFile,
  ];

  if (fs.mkdirp) {
    for (const dir of new Set(files.map((file) => dirname(file.path)))) {
      await fs.mkdirp(dir);
    }
  }

  await writeFilesAtomic(fs, files);
  return { ...bundle, files };
}

async function missingDefaultSidecars(
  paths: BundlePaths,
  fs: GeneratedBundleFs,
  sidecars: ReadonlyArray<FileEntry>,
): Promise<FileEntry[]> {
  const explicitSidecars = new Set(sidecars.map((entry) => entry.path));
  const defaults: FileEntry[] = [
    { path: paths.layout, content: saveLayout(DEFAULT_LAYOUT) },
    { path: paths.chat, content: saveChatHistory(DEFAULT_CHAT_HISTORY) },
  ];
  const missing: FileEntry[] = [];

  for (const entry of defaults) {
    if (explicitSidecars.has(entry.path)) continue;
    try {
      await fs.readFile(entry.path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        missing.push(entry);
        continue;
      }
      throw err;
    }
  }

  return missing;
}

export async function writeFilesAtomic(
  fs: GeneratedBundleFs,
  files: ReadonlyArray<FileEntry>,
): Promise<void> {
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

async function checkGeneratedTargetCollisions(
  emitted: ReadonlyArray<FileEntry>,
  fs: Pick<GeneratedBundleFs, 'readFile'>,
): Promise<GeneratedFileCheck[]> {
  const collisions: GeneratedFileCheck[] = [];
  for (const entry of emitted) {
    try {
      const onDisk = await fs.readFile(entry.path);
      if (onDisk !== entry.content) collisions.push({ path: entry.path, status: 'drifted' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        collisions.push({ path: entry.path, status: 'unreadable' });
      }
    }
  }
  return collisions;
}

function dirname(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const slash = normalized.lastIndexOf('/');
  if (slash <= 0) return slash === 0 ? '/' : '.';
  return normalized.slice(0, slash);
}
