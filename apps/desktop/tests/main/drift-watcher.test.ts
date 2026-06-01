/**
 * `createDriftWatcher` + `detectDrift` — unit tests using injected
 * `readFile` so we don't need to mock node:fs modules. The watcher is
 * exercised via `check()` which runs the same logic as the debounced
 * fs.watch handler.
 */
import { createHash } from 'node:crypto';
import { buildGeneratedBundle, type Schema } from '@contexture/core';
import { createDriftWatcher, detectDrift } from '@main/documents/drift-watcher';
import { describe, expect, it, vi } from 'vitest';

const IR_PATH = '/proj/packages/contexture/garden.contexture.json';
const WATCHED = '/proj/packages/contexture/convex/schema.ts';
const SCHEMA_TS = '/proj/packages/contexture/garden.schema.ts';
const SCHEMA_JSON = '/proj/packages/contexture/garden.schema.json';
const SCHEMA_INDEX = '/proj/packages/contexture/index.ts';
const EMITTED = '/proj/packages/contexture/.contexture/emitted.json';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function makeManifest(files: Record<string, string>): string {
  const hashed: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    hashed[path] = sha256(content);
  }
  return JSON.stringify({ version: '1', files: hashed }, null, 2);
}

// Single-file helper for focused drift tests.
function makeManifestSingleHash(hash: string): string {
  return JSON.stringify({ version: '1', files: { [WATCHED]: hash } }, null, 2);
}

function makeReadFile(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    if (path in files) return files[path];
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  };
}

function generatedFilesFor(schema: Schema): Record<string, string> {
  const bundle = buildGeneratedBundle(schema, IR_PATH);
  return Object.fromEntries([
    ...bundle.emitted.map((entry) => [entry.path, entry.content] as const),
    [bundle.manifestFile.path, bundle.manifestFile.content] as const,
  ]);
}

function makeWatcher(
  files: Record<string, string>,
  {
    onDrift = vi.fn(),
    onStatus,
    onResolved = vi.fn(),
  }: {
    onDrift?: ReturnType<typeof vi.fn>;
    onStatus?: ReturnType<typeof vi.fn>;
    onResolved?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const watcher = createDriftWatcher({
    irPath: IR_PATH,
    onDrift,
    onStatus,
    onResolved,
    readFile: makeReadFile(files),
  });
  return { watcher, onDrift, onStatus, onResolved };
}

// ─── detectDrift (pure function) ─────────────────────────────────────

describe('detectDrift', () => {
  it('returns "match" for all files when hashes agree', async () => {
    const convex = 'defineSchema({})';
    const zodTs = 'export const schema = z.object({})';
    const jsonSchema = '{"type":"object"}';
    const index = 'export * from "./garden.schema"';
    const files: Record<string, string> = {
      [WATCHED]: convex,
      [SCHEMA_TS]: zodTs,
      [SCHEMA_JSON]: jsonSchema,
      [SCHEMA_INDEX]: index,
      [EMITTED]: makeManifest({
        [WATCHED]: convex,
        [SCHEMA_TS]: zodTs,
        [SCHEMA_JSON]: jsonSchema,
        [SCHEMA_INDEX]: index,
      }),
    };
    const results = await detectDrift(EMITTED, makeReadFile(files));
    expect(results).toEqual([
      { path: WATCHED, status: 'match' },
      { path: SCHEMA_TS, status: 'match' },
      { path: SCHEMA_JSON, status: 'match' },
      { path: SCHEMA_INDEX, status: 'match' },
    ]);
  });

  it('returns "drifted" for files whose hash differs', async () => {
    const convex = 'defineSchema({})';
    const editedConvex = 'defineSchema({ posts: defineTable({}) })';
    const zodTs = 'export const schema = z.object({})';
    const files: Record<string, string> = {
      [WATCHED]: editedConvex,
      [SCHEMA_TS]: zodTs,
      [EMITTED]: makeManifest({
        [WATCHED]: convex,
        [SCHEMA_TS]: zodTs,
      }),
    };
    const results = await detectDrift(EMITTED, makeReadFile(files));
    expect(results).toEqual([
      { path: WATCHED, status: 'drifted' },
      { path: SCHEMA_TS, status: 'match' },
    ]);
  });

  it('returns "unreadable" when a manifest file cannot be read', async () => {
    const convex = 'defineSchema({})';
    const files: Record<string, string> = {
      [WATCHED]: convex,
      // SCHEMA_TS is missing from disk
      [EMITTED]: makeManifest({
        [WATCHED]: convex,
        [SCHEMA_TS]: 'some content',
      }),
    };
    const results = await detectDrift(EMITTED, makeReadFile(files));
    expect(results).toEqual([
      { path: WATCHED, status: 'match' },
      { path: SCHEMA_TS, status: 'unreadable' },
    ]);
  });

  it('returns empty array when manifest cannot be read', async () => {
    const results = await detectDrift(EMITTED, makeReadFile({}));
    expect(results).toEqual([]);
  });

  it('returns empty array when manifest has no files', async () => {
    const files: Record<string, string> = {
      [EMITTED]: JSON.stringify({ version: '1', files: {} }),
    };
    const results = await detectDrift(EMITTED, makeReadFile(files));
    expect(results).toEqual([]);
  });

  it('ignores manifest entries outside the allowed generated target set', async () => {
    const files: Record<string, string> = {
      [WATCHED]: 'defineSchema({})',
      '/etc/passwd': 'root',
      [EMITTED]: makeManifest({
        [WATCHED]: 'defineSchema({})',
        '/etc/passwd': 'edited root',
      }),
    };

    const results = await detectDrift(EMITTED, makeReadFile(files), {
      allowedPaths: [WATCHED],
    });

    expect(results).toEqual([{ path: WATCHED, status: 'match' }]);
  });

  it('resolves relative manifest entries against the current bundle root', async () => {
    const content = 'defineSchema({})';
    const files: Record<string, string> = {
      [WATCHED]: content,
      [EMITTED]: makeManifest({ 'convex/schema.ts': content }),
    };

    const results = await detectDrift(EMITTED, makeReadFile(files), {
      allowedPaths: [WATCHED],
    });

    expect(results).toEqual([{ path: WATCHED, status: 'match' }]);
  });

  it('maps old absolute manifest entries to the current checkout path by target suffix', async () => {
    const content = 'defineSchema({})';
    const files: Record<string, string> = {
      [WATCHED]: content,
      [EMITTED]: makeManifest({ '/Users/rufus/Apps/plantry/convex/schema.ts': content }),
    };

    const results = await detectDrift(EMITTED, makeReadFile(files), {
      allowedPaths: [WATCHED],
    });

    expect(results).toEqual([{ path: WATCHED, status: 'match' }]);
  });
});

// ─── createDriftWatcher (multi-file) ─────────────────────────────────

describe('createDriftWatcher', () => {
  it('calls onDrift when file hash differs from emitted manifest', async () => {
    const original = 'defineSchema({})';
    const edited = 'defineSchema({ posts: defineTable({}) })';
    const { watcher, onDrift, onResolved } = makeWatcher({
      [WATCHED]: edited,
      [EMITTED]: makeManifestSingleHash(sha256(original)),
    });

    await watcher.check();

    expect(onDrift).toHaveBeenCalledOnce();
    expect(onDrift).toHaveBeenCalledWith([WATCHED]);
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('calls onResolved when hashes match after being drifted', async () => {
    const content = 'defineSchema({})';
    const hash = sha256(content);

    let currentWatched = 'editedContent';
    const readFile = async (path: string): Promise<string> => {
      if (path === WATCHED) return currentWatched;
      if (path === EMITTED) return makeManifestSingleHash(hash);
      throw new Error('unexpected');
    };
    const onDrift = vi.fn();
    const onResolved = vi.fn();
    const watcher = createDriftWatcher({
      irPath: IR_PATH,
      onDrift,
      onResolved,
      readFile,
    });

    await watcher.check();
    expect(onDrift).toHaveBeenCalledOnce();

    currentWatched = content;
    await watcher.check();
    expect(onResolved).toHaveBeenCalledOnce();
  });

  it('does not call onDrift when hashes match (self-write suppression)', async () => {
    const content = 'defineSchema({})';
    const hash = sha256(content);
    const { watcher, onDrift, onResolved } = makeWatcher({
      [WATCHED]: content,
      [EMITTED]: makeManifestSingleHash(hash),
    });

    await watcher.check();

    expect(onDrift).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('calls onDrift when a manifest file cannot be read', async () => {
    const { watcher, onDrift } = makeWatcher({
      [EMITTED]: makeManifestSingleHash('somehash'),
      // WATCHED is absent → ENOENT → unreadable → needs attention
    });

    await watcher.check();
    expect(onDrift).toHaveBeenCalledWith([WATCHED]);
  });

  it('calls onStatus with drifted and unreadable file statuses', async () => {
    const convex = 'defineSchema({})';
    const editedConvex = 'defineSchema({ posts: defineTable({}) })';
    const onDrift = vi.fn();
    const onStatus = vi.fn();
    const { watcher } = makeWatcher(
      {
        [WATCHED]: editedConvex,
        [EMITTED]: makeManifest({
          [WATCHED]: convex,
          [SCHEMA_TS]: 'missing zod',
        }),
      },
      { onDrift, onStatus },
    );

    await watcher.check();

    expect(onDrift).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenCalledWith([
      { path: WATCHED, status: 'drifted' },
      { path: SCHEMA_TS, status: 'unreadable' },
    ]);
  });

  it('calls onStatus with stale when files match the old manifest but not the current IR', async () => {
    const originalSchema: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Post', table: true, fields: [] }],
    };
    const currentSchema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
      ],
    };
    const files = {
      [IR_PATH]: `${JSON.stringify(currentSchema, null, 2)}\n`,
      ...generatedFilesFor(originalSchema),
    };
    const onStatus = vi.fn();
    const { watcher } = makeWatcher(files, { onStatus });

    await watcher.check();

    expect(onStatus).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ path: WATCHED, status: 'stale' })]),
    );
  });

  it('calls onStatus with externally_regenerated when files match current IR but manifest is old', async () => {
    const originalSchema: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Post', table: true, fields: [] }],
    };
    const currentSchema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
      ],
    };
    const originalFiles = generatedFilesFor(originalSchema);
    const currentFiles = generatedFilesFor(currentSchema);
    const files = {
      [IR_PATH]: `${JSON.stringify(currentSchema, null, 2)}\n`,
      ...currentFiles,
      [EMITTED]: originalFiles[EMITTED] ?? '',
    };
    const onStatus = vi.fn();
    const { watcher } = makeWatcher(files, { onStatus });

    await watcher.check();

    expect(onStatus).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ path: WATCHED, status: 'externally_regenerated' }),
      ]),
    );
  });

  it('does not call onDrift when the emitted manifest cannot be read', async () => {
    const { watcher, onDrift } = makeWatcher({
      [WATCHED]: 'defineSchema({})',
      // EMITTED is absent → ENOENT
    });

    await watcher.check();
    expect(onDrift).not.toHaveBeenCalled();
  });

  it('does not fire onDrift twice for repeated drifted checks', async () => {
    const original = 'defineSchema({})';
    const edited = 'defineSchema({ posts: defineTable({}) })';
    const { watcher, onDrift } = makeWatcher({
      [WATCHED]: edited,
      [EMITTED]: makeManifestSingleHash(sha256(original)),
    });

    await watcher.check();
    await watcher.check();

    // onDrift fires once — second check keeps the same drifted state.
    expect(onDrift).toHaveBeenCalledOnce();
  });

  it('calls onDrift with all drifted paths when multiple files drift', async () => {
    const convex = 'defineSchema({})';
    const zodTs = 'export const schema = z.object({})';
    const editedConvex = 'defineSchema({ posts: defineTable({}) })';
    const editedZod = 'export const schema = z.object({ name: z.string() })';
    const { watcher, onDrift } = makeWatcher({
      [WATCHED]: editedConvex,
      [SCHEMA_TS]: editedZod,
      [EMITTED]: makeManifest({
        [WATCHED]: convex,
        [SCHEMA_TS]: zodTs,
      }),
    });

    await watcher.check();

    expect(onDrift).toHaveBeenCalledOnce();
    expect(onDrift).toHaveBeenCalledWith(expect.arrayContaining([WATCHED, SCHEMA_TS]));
  });

  it('updates drifted paths when a new file drifts', async () => {
    const convex = 'defineSchema({})';
    const zodTs = 'export const schema = z.object({})';
    const editedConvex = 'defineSchema({ posts: defineTable({}) })';

    let currentZod = zodTs;
    const readFile = async (path: string): Promise<string> => {
      if (path === WATCHED) return editedConvex;
      if (path === SCHEMA_TS) return currentZod;
      if (path === EMITTED) return makeManifest({ [WATCHED]: convex, [SCHEMA_TS]: zodTs });
      throw new Error('unexpected');
    };
    const onDrift = vi.fn();
    const onResolved = vi.fn();
    const watcher = createDriftWatcher({
      irPath: IR_PATH,
      onDrift,
      onResolved,
      readFile,
    });

    await watcher.check();
    expect(onDrift).toHaveBeenCalledWith([WATCHED]);

    // Now the zod file also drifts
    currentZod = 'edited zod';
    await watcher.check();
    expect(onDrift).toHaveBeenCalledTimes(2);
    expect(onDrift).toHaveBeenLastCalledWith(expect.arrayContaining([WATCHED, SCHEMA_TS]));
  });

  it('only fires onResolved when ALL files return to matching', async () => {
    const convex = 'defineSchema({})';
    const zodTs = 'export const schema = z.object({})';
    const editedConvex = 'defineSchema({ posts: defineTable({}) })';
    const editedZod = 'edited zod';

    let currentConvex = editedConvex;
    let currentZod = editedZod;
    const readFile = async (path: string): Promise<string> => {
      if (path === WATCHED) return currentConvex;
      if (path === SCHEMA_TS) return currentZod;
      if (path === EMITTED) return makeManifest({ [WATCHED]: convex, [SCHEMA_TS]: zodTs });
      throw new Error('unexpected');
    };
    const onDrift = vi.fn();
    const onResolved = vi.fn();
    const watcher = createDriftWatcher({
      irPath: IR_PATH,
      onDrift,
      onResolved,
      readFile,
    });

    // Both files drifted
    await watcher.check();
    expect(onDrift).toHaveBeenCalledOnce();

    // Fix one file — still drifted (not resolved)
    currentConvex = convex;
    await watcher.check();
    expect(onResolved).not.toHaveBeenCalled();
    // onDrift fires again with updated paths
    expect(onDrift).toHaveBeenCalledTimes(2);
    expect(onDrift).toHaveBeenLastCalledWith([SCHEMA_TS]);

    // Fix the other file — now resolved
    currentZod = zodTs;
    await watcher.check();
    expect(onResolved).toHaveBeenCalledOnce();
  });

  it('resetDrifted clears all tracked paths', async () => {
    const convex = 'defineSchema({})';
    const editedConvex = 'defineSchema({ posts: defineTable({}) })';
    const { watcher, onDrift } = makeWatcher({
      [WATCHED]: editedConvex,
      [EMITTED]: makeManifest({ [WATCHED]: convex }),
    });

    await watcher.check();
    expect(onDrift).toHaveBeenCalledOnce();

    watcher.resetDrifted();

    // After reset, the same drift fires onDrift again
    await watcher.check();
    expect(onDrift).toHaveBeenCalledTimes(2);
  });

  it('does not fire callbacks after stop() during in-flight check', async () => {
    const original = 'defineSchema({})';
    const edited = 'defineSchema({ posts: defineTable({}) })';
    const flush = () => new Promise((r) => setTimeout(r, 0));
    let resolveFileRead: ((value: string) => void) | null = null;
    const readFile = async (path: string): Promise<string> => {
      if (path === EMITTED) return makeManifestSingleHash(sha256(original));
      if (path === WATCHED) {
        return new Promise<string>((resolve) => {
          resolveFileRead = resolve;
        });
      }
      throw new Error('unexpected');
    };
    const onDrift = vi.fn();
    const onResolved = vi.fn();
    const watcher = createDriftWatcher({
      irPath: IR_PATH,
      onDrift,
      onResolved,
      readFile,
    });

    const checkPromise = watcher.check();
    await flush();
    watcher.stop();
    resolveFileRead?.(edited);
    await checkPromise;

    expect(onDrift).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
