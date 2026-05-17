/**
 * Drift detection for `@contexture-generated` files.
 *
 * `detectDrift` is a pure function that reads `.contexture/emitted.json`,
 * hashes manifest entries that are inside the caller's allowed target set,
 * and returns a per-file status (`match | drifted | unreadable`). It has no
 * side effects and can be reused by the CLI's file-backed forward (#207).
 *
 * `createDriftWatcher` derives the manifest path and generated target set
 * from the open IR, then wraps `detectDrift` with `fs.watch` subscriptions
 * so the Electron main process gets live callbacks when a generated file is
 * hand-edited (or returns to its expected hash).
 *
 * Self-write suppression: the DocumentStore writes `emitted.json`
 * before it writes the watched files in the atomic bundle; by the time
 * the watcher fires the hashes already match, so Contexture's own
 * writes are silently ignored.
 */
import { createHash } from 'node:crypto';
import { type FSWatcher, promises as fsPromises, watch } from 'node:fs';
import { bundlePathsFor, generatedTargetsFor } from '@contexture/core';

// ─── Pure detector ───────────────────────────────────────────────────

export interface DriftResult {
  path: string;
  status: 'match' | 'drifted' | 'unreadable';
}

export interface DriftProblem {
  path: string;
  status: 'drifted' | 'unreadable';
}

export async function detectDrift(
  emittedJsonPath: string,
  readFile: (path: string) => Promise<string> = (p) => fsPromises.readFile(p, 'utf-8'),
  options: { allowedPaths?: readonly string[] } = {},
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
  const allowed = options.allowedPaths ? new Set(options.allowedPaths) : null;

  const results: DriftResult[] = [];
  for (const [filePath, expectedHash] of Object.entries(files)) {
    if (allowed && !allowed.has(filePath)) continue;
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
  irPath: string;
  onDrift: (paths: string[]) => void;
  onStatus?: (problems: DriftProblem[]) => void;
  onResolved: () => void;
  debounceMs?: number;
  readFile?: (path: string) => Promise<string>;
}

export function createDriftWatcher(opts: DriftWatcherOptions): DriftWatcher {
  const {
    irPath,
    onDrift,
    onStatus,
    onResolved,
    debounceMs = 300,
    readFile = (p) => fsPromises.readFile(p, 'utf-8'),
  } = opts;
  const emittedJsonPath = bundlePathsFor(irPath).emitted;
  const allowedPaths = generatedTargetsFor(irPath).map((entry) => entry.path);

  let watchers: FSWatcher[] = [];
  let watchedPaths: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let problemSet: Set<string> = new Set();
  let stopped = false;

  async function doCheck(): Promise<void> {
    const results = await detectDrift(emittedJsonPath, readFile, { allowedPaths });
    if (stopped || results.length === 0) return;

    const problems = results.filter((r): r is DriftProblem => r.status !== 'match');
    const nowProblems = problems.map(problemKey);
    const wasProblematic = problemSet.size > 0;
    const isProblematic = problems.length > 0;

    if (isProblematic) {
      const changed =
        nowProblems.length !== problemSet.size || nowProblems.some((p) => !problemSet.has(p));
      problemSet = new Set(nowProblems);
      if (!wasProblematic || changed) {
        if (onStatus) onStatus(problems);
        else onDrift(problems.map((p) => p.path));
      }
    } else if (wasProblematic) {
      problemSet = new Set();
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
      problemSet = new Set();
    },
    check: doCheck,
    resetDrifted() {
      problemSet = new Set();
    },
  };
}

function problemKey(problem: DriftProblem): string {
  return `${problem.status}:${problem.path}`;
}
