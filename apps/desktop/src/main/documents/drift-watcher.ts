/**
 * Drift detection for `@contexture-generated` files.
 *
 * `detectDrift` is a pure function that reads `.contexture/emitted.json`,
 * hashes every file listed in the manifest, and returns a per-file
 * status (`match | drifted | unreadable`). It has no side effects and
 * can be reused by the CLI's file-backed forward (#207).
 *
 * `createDriftWatcher` wraps `detectDrift` with `fs.watch` subscriptions
 * so the Electron main process gets live callbacks when any manifest
 * file is hand-edited (or returns to its expected hash).
 *
 * Self-write suppression: the DocumentStore writes `emitted.json`
 * before it writes the watched files in the atomic bundle; by the time
 * the watcher fires the hashes already match, so Contexture's own
 * writes are silently ignored.
 */
import { createHash } from 'node:crypto';
import { type FSWatcher, promises as fsPromises, watch } from 'node:fs';

// ─── Pure detector ───────────────────────────────────────────────────

export interface DriftResult {
  path: string;
  status: 'match' | 'drifted' | 'unreadable';
}

export async function detectDrift(
  emittedJsonPath: string,
  readFile: (path: string) => Promise<string> = (p) => fsPromises.readFile(p, 'utf-8'),
): Promise<DriftResult[]> {
  let manifest: { files?: Record<string, string> };
  try {
    const raw = await readFile(emittedJsonPath);
    manifest = JSON.parse(raw) as { files?: Record<string, string> };
  } catch {
    return [];
  }

  const files = manifest.files;
  if (!files || Object.keys(files).length === 0) return [];

  const results: DriftResult[] = [];
  for (const [filePath, expectedHash] of Object.entries(files)) {
    let actual: string | null;
    try {
      const content = await readFile(filePath);
      actual = createHash('sha256').update(content, 'utf8').digest('hex');
    } catch {
      actual = null;
    }
    if (actual === null) {
      results.push({ path: filePath, status: 'unreadable' });
    } else if (actual !== expectedHash) {
      results.push({ path: filePath, status: 'drifted' });
    } else {
      results.push({ path: filePath, status: 'match' });
    }
  }
  return results;
}

// ─── Watcher ─────────────────────────────────────────────────────────

export interface DriftWatcher {
  start(): void;
  stop(): void;
  check(): Promise<void>;
  resetDrifted(): void;
}

export interface DriftWatcherOptions {
  emittedJsonPath: string;
  onDrift: (paths: string[]) => void;
  onResolved: () => void;
  debounceMs?: number;
  readFile?: (path: string) => Promise<string>;
}

export function createDriftWatcher(opts: DriftWatcherOptions): DriftWatcher {
  const {
    emittedJsonPath,
    onDrift,
    onResolved,
    debounceMs = 300,
    readFile = (p) => fsPromises.readFile(p, 'utf-8'),
  } = opts;

  let watchers: FSWatcher[] = [];
  let watchedPaths: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let driftedSet: Set<string> = new Set();
  let stopped = false;

  async function doCheck(): Promise<void> {
    const results = await detectDrift(emittedJsonPath, readFile);
    if (stopped || results.length === 0) return;

    const nowDrifted = results.filter((r) => r.status === 'drifted').map((r) => r.path);
    const wasDrifted = driftedSet.size > 0;
    const isDrifted = nowDrifted.length > 0;

    if (isDrifted) {
      const changed =
        nowDrifted.length !== driftedSet.size || nowDrifted.some((p) => !driftedSet.has(p));
      driftedSet = new Set(nowDrifted);
      if (!wasDrifted || changed) {
        onDrift(nowDrifted);
      }
    } else if (wasDrifted) {
      driftedSet = new Set();
      onResolved();
    }

    updateWatchers(results.map((r) => r.path));
  }

  function scheduleCheck(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void doCheck();
    }, debounceMs);
  }

  function updateWatchers(manifestPaths: string[]): void {
    const newPaths = manifestPaths.filter((p) => !watchedPaths.includes(p));
    for (const p of newPaths) {
      try {
        const w = watch(p, () => scheduleCheck());
        watchers.push(w);
      } catch {
        // File may not exist yet — that's fine, we'll detect on next check.
      }
    }
    watchedPaths = [...new Set([...watchedPaths, ...manifestPaths])];
  }

  return {
    start() {
      stopped = false;
      void doCheck();
    },
    stop() {
      stopped = true;
      for (const w of watchers) w.close();
      watchers = [];
      watchedPaths = [];
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      driftedSet = new Set();
    },
    check: doCheck,
    resetDrifted() {
      driftedSet = new Set();
    },
  };
}
