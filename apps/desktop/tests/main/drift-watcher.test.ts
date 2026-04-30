/**
 * `createDriftWatcher` + `detectDrift` — unit tests using injected
 * `readFile` so we don't need to mock node:fs modules. The watcher is
 * exercised via `check()` which runs the same logic as the debounced
 * fs.watch handler.
 */
import { createHash } from 'node:crypto';
import { createDriftWatcher, detectDrift } from '@main/documents/drift-watcher';
import { describe, expect, it, vi } from 'vitest';

const WATCHED = '/proj/apps/web/convex/schema.ts';
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

// Legacy single-file helper for backward-compat tests
function makeManifestSingleHash(hash: string): string {
  return JSON.stringify({ version: '1', files: { [WATCHED]: hash } }, null, 2);
}

function makeReadFile(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    if (path in files) return files[path];
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  };
}

function makeWatcher(
  files: Record<string, string>,
  {
    onDrift = vi.fn(),
    onResolved = vi.fn(),
  }: { onDrift?: ReturnType<typeof vi.fn>; onResolved?: ReturnType<typeof vi.fn> } = {},
) {
  const watcher = createDriftWatcher({
    emittedJsonPath: EMITTED,
    onDrift,
    onResolved,
    readFile: makeReadFile(files),
  });
  return { watcher, onDrift, onResolved };
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
      emittedJsonPath: EMITTED,
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

  it('does not call onDrift when the watched file cannot be read', async () => {
    const { watcher, onDrift } = makeWatcher({
      [EMITTED]: makeManifestSingleHash('somehash'),
      // WATCHED is absent → ENOENT → unreadable → not drifted
    });

    await watcher.check();
    expect(onDrift).not.toHaveBeenCalled();
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
      emittedJsonPath: EMITTED,
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
      emittedJsonPath: EMITTED,
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
      emittedJsonPath: EMITTED,
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
