/**
 * `createDriftWatcher` — unit tests using injected `readFile` so we
 * don't need to mock node:fs modules. The watcher is exercised via
 * `check()` which runs the same logic as the debounced fs.watch handler.
 */
import { createHash } from 'node:crypto';
import { createDriftWatcher } from '@main/documents/drift-watcher';
import { describe, expect, it, vi } from 'vitest';

const WATCHED = '/proj/apps/web/convex/schema.ts';
const EMITTED = '/proj/packages/schema/.contexture/emitted.json';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function makeManifest(hash: string): string {
  return JSON.stringify({ version: '1', files: { [WATCHED]: hash } }, null, 2);
}

function makeWatcher(
  files: Record<string, string>,
  {
    onDrift = vi.fn(),
    onResolved = vi.fn(),
  }: { onDrift?: ReturnType<typeof vi.fn>; onResolved?: ReturnType<typeof vi.fn> } = {},
) {
  const readFile = async (path: string): Promise<string> => {
    if (path in files) return files[path];
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  };
  const watcher = createDriftWatcher({
    watchedPath: WATCHED,
    emittedJsonPath: EMITTED,
    onDrift,
    onResolved,
    readFile,
  });
  return { watcher, onDrift, onResolved };
}

describe('createDriftWatcher', () => {
  it('calls onDrift when file hash differs from emitted manifest', async () => {
    const original = 'defineSchema({})';
    const edited = 'defineSchema({ posts: defineTable({}) })';
    const { watcher, onDrift, onResolved } = makeWatcher({
      [WATCHED]: edited,
      [EMITTED]: makeManifest(sha256(original)),
    });

    await watcher.check();

    expect(onDrift).toHaveBeenCalledOnce();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('calls onResolved when hashes match after being drifted', async () => {
    const content = 'defineSchema({})';
    const hash = sha256(content);

    let currentWatched = 'editedContent';
    const readFile = async (path: string): Promise<string> => {
      if (path === WATCHED) return currentWatched;
      if (path === EMITTED) return makeManifest(hash);
      throw new Error('unexpected');
    };
    const onDrift = vi.fn();
    const onResolved = vi.fn();
    const watcher = createDriftWatcher({
      watchedPath: WATCHED,
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
      [EMITTED]: makeManifest(hash),
    });

    await watcher.check();

    expect(onDrift).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('does not call onDrift when the watched file cannot be read', async () => {
    const { watcher, onDrift } = makeWatcher({
      [EMITTED]: makeManifest('somehash'),
      // WATCHED is absent → ENOENT
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
      [EMITTED]: makeManifest(sha256(original)),
    });

    await watcher.check();
    await watcher.check();

    // onDrift fires once — second check keeps the same drifted state.
    expect(onDrift).toHaveBeenCalledOnce();
  });
});
