import { DEFAULT_CHAT_HISTORY, saveChatHistory } from './chat-history';
import type { Schema } from './ir';
import { DEFAULT_LAYOUT, saveLayout } from './layout';
import { save } from './load';
import { type BundlePaths, bundlePathsFor, resolveManifestGeneratedPath } from './paths';
import {
  type EmitPipelineDeps,
  type EmittedManifest,
  type FileEntry,
  hashContent,
  runEmitPipeline,
} from './pipeline';

export type GeneratedFileStatus = 'clean' | 'missing' | 'drifted' | 'unreadable';
export type GeneratedDriftClassification =
  | 'clean'
  | 'missing'
  | 'unreadable'
  | 'modified'
  | 'stale'
  | 'externally_regenerated';

export interface GeneratedFileCheck {
  path: string;
  status: GeneratedFileStatus;
}

export interface GeneratedDriftCheck {
  path: string;
  status: GeneratedDriftClassification;
  matchesManifest: boolean;
  matchesCurrentIr: boolean;
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
  const paths = bundlePathsFor(irPath, schema);
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
  schema?: Schema,
): Promise<GeneratedFileCheck[]> {
  const paths = bundlePathsFor(irPath);
  const manifest = await readGeneratedManifest(paths.emitted, fs);
  if (manifest === null) {
    return [];
  }

  const checks: GeneratedFileCheck[] = [];
  for (const [manifestKey, expectedHash] of Object.entries(manifest.files ?? {})) {
    const path = resolveManifestGeneratedPath(irPath, manifestKey, schema);
    let content: string | undefined;
    try {
      content = await fs.readFile(path);
    } catch {
      content = undefined;
    }

    if (content === undefined) checks.push({ path, status: 'missing' });
    else if (hashContent(content) !== expectedHash) checks.push({ path, status: 'drifted' });
    else checks.push({ path, status: 'clean' });
  }

  return checks;
}

export async function classifyGeneratedBundleDrift(
  schema: Schema,
  irPath: string,
  fs: Pick<GeneratedBundleFs, 'readFile'>,
  emitDeps?: EmitPipelineDeps,
): Promise<GeneratedDriftCheck[]> {
  const bundle = buildGeneratedBundle(schema, irPath, emitDeps);
  const manifest = await readGeneratedManifest(bundle.paths.emitted, fs);
  const manifestFiles = Object.fromEntries(
    Object.entries(manifest?.files ?? {}).map(([manifestKey, hash]) => [
      resolveManifestGeneratedPath(irPath, manifestKey, schema),
      hash,
    ]),
  );
  const emittedByPath = new Map(bundle.emitted.map((entry) => [entry.path, entry.content]));
  const targetPaths = new Set([...Object.keys(manifestFiles), ...emittedByPath.keys()]);
  const checks: GeneratedDriftCheck[] = [];

  for (const path of targetPaths) {
    const expectedContent = emittedByPath.get(path) ?? null;
    const manifestHash = manifestFiles[path] ?? null;
    let diskContent: string | null = null;
    let readable = true;

    try {
      diskContent = await fs.readFile(path);
    } catch (err) {
      readable = false;
      const code = (err as NodeJS.ErrnoException).code;
      const status = code === 'ENOENT' ? 'missing' : 'unreadable';
      checks.push({
        path,
        status,
        matchesManifest: false,
        matchesCurrentIr: false,
      });
    }

    if (!readable || diskContent === null) continue;

    const diskHash = hashContent(diskContent);
    const matchesManifest = manifestHash !== null && diskHash === manifestHash;
    const matchesCurrentIr = expectedContent !== null && diskContent === expectedContent;

    let status: GeneratedDriftClassification;
    if (matchesManifest && matchesCurrentIr) {
      status = 'clean';
    } else if (matchesManifest) {
      status = 'stale';
    } else if (matchesCurrentIr) {
      status = 'externally_regenerated';
    } else {
      status = 'modified';
    }

    checks.push({ path, status, matchesManifest, matchesCurrentIr });
  }

  return checks;
}

async function readGeneratedManifest(
  manifestPath: string,
  fs: Pick<GeneratedBundleFs, 'readFile'>,
): Promise<EmittedManifest | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath)) as Partial<EmittedManifest>;
    return {
      version: '1',
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
    };
  } catch {
    return null;
  }
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
    const drift = (await checkGeneratedManifestDrift(irPath, fs, schema)).filter(
      (check) => check.status !== 'clean' && check.status !== 'missing',
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
