/**
 * `createDriftWatcher` — watches a single file for hand-edits and
 * compares its SHA-256 hash against the expected hash stored in
 * `.contexture/emitted.json`. When the hashes differ the watcher
 * calls `onDrift`; when they match again (because Contexture rewrote
 * the file) it calls `onResolved`.
 *
 * Only `apps/web/convex/schema.ts` is watched — nothing else.
 *
 * Self-write suppression: the DocumentStore writes `emitted.json`
 * before it writes the watched file in the atomic bundle; by the time
 * the watcher fires the hashes already match, so Contexture's own
 * writes are silently ignored.
 */
import { createHash } from 'node:crypto';
import { type FSWatcher, promises as fsPromises, watch } from 'node:fs';

export interface DriftWatcher {
  start(): void;
  stop(): void;
  /** Force an immediate hash check (used by window-focus handler). */
  check(): Promise<void>;
}

export interface DriftWatcherOptions {
  /** Absolute path to the file being watched (e.g. `.../convex/schema.ts`). */
  watchedPath: string;
  /** Absolute path to `.contexture/emitted.json`. */
  emittedJsonPath: string;
  onDrift: () => void;
  onResolved: () => void;
  /** Debounce delay in ms (default 300). */
  debounceMs?: number;
  /** Injected file reader — defaults to `fs.promises.readFile`. Tests stub this. */
  readFile?: (path: string) => Promise<string>;
}

export function createDriftWatcher(opts: DriftWatcherOptions): DriftWatcher {
  const {
    watchedPath,
    emittedJsonPath,
    onDrift,
    onResolved,
    debounceMs = 300,
    readFile = (p) => fsPromises.readFile(p, 'utf-8'),
  } = opts;
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let drifted = false;

  async function computeHash(path: string): Promise<string | null> {
    try {
      const content = await readFile(path);
      return createHash('sha256').update(content, 'utf8').digest('hex');
    } catch {
      return null;
    }
  }

  async function expectedHash(): Promise<string | null> {
    try {
      const raw = await readFile(emittedJsonPath);
      const manifest = JSON.parse(raw) as { files?: Record<string, string> };
      return manifest.files?.[watchedPath] ?? null;
    } catch {
      return null;
    }
  }

  async function doCheck(): Promise<void> {
    const [actual, expected] = await Promise.all([computeHash(watchedPath), expectedHash()]);
    if (actual === null || expected === null) return;
    const nowDrifted = actual !== expected;
    if (nowDrifted && !drifted) {
      drifted = true;
      onDrift();
    } else if (!nowDrifted && drifted) {
      drifted = false;
      onResolved();
    }
  }

  function scheduleCheck(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void doCheck();
    }, debounceMs);
  }

  return {
    start() {
      if (watcher) return;
      watcher = watch(watchedPath, () => scheduleCheck());
    },
    stop() {
      watcher?.close();
      watcher = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      drifted = false;
    },
    check: doCheck,
  };
}
