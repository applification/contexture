/**
 * Source-model sync watcher for the open `.contexture.json`.
 *
 * This is deliberately separate from generated drift detection:
 * - model sync watches the IR source of truth and keeps the canvas current;
 * - generated drift watches emitted targets and feeds Reconcile.
 */
import { type FSWatcher, promises as fsPromises, watch } from 'node:fs';
import {
  load as loadIR,
  loadModelChangeLog,
  type ModelChangeLogEntry,
  type ModelChangeSource,
  type Schema,
  schemaHash,
} from '@contexture/core';
import { hashContent } from '@contexture/core/pipeline';

export type ModelSyncStatus = 'changed' | 'invalid_json' | 'invalid_ir' | 'unreadable' | 'deleted';

export interface ModelSyncEvent {
  irPath: string;
  status: ModelSyncStatus;
  source: ModelChangeSource | 'unknown';
  observedAt: number;
  revision: string;
  content?: string;
  schema?: Schema;
  error?: string;
  change?: ModelChangeLogEntry;
}

export interface ModelSyncWatcher {
  start(): void;
  stop(): void;
  check(): Promise<void>;
  acknowledgeSelfWrite(revision: string): void;
}

export interface ModelSyncWatcherOptions {
  irPath: string;
  onEvent: (event: ModelSyncEvent) => void;
  debounceMs?: number;
  readFile?: (path: string) => Promise<string>;
}

export function createModelSyncWatcher(opts: ModelSyncWatcherOptions): ModelSyncWatcher {
  const {
    irPath,
    onEvent,
    debounceMs = 300,
    readFile = (path) => fsPromises.readFile(path, 'utf8'),
  } = opts;

  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let lastSeenRevision: string | null = null;
  let lastSelfWriteRevision: string | null = null;
  let lastEventKey: string | null = null;

  async function classify(): Promise<ModelSyncEvent> {
    let raw: string;
    try {
      raw = await readFile(irPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      return {
        irPath,
        status: code === 'ENOENT' ? 'deleted' : 'unreadable',
        source: 'unknown',
        observedAt: Date.now(),
        revision: code === 'ENOENT' ? 'deleted' : 'unreadable',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const revision = hashContent(raw);
    try {
      const { schema } = loadIR(raw);
      const matchingChange = await findMatchingChange(irPath, schema, readFile);
      return {
        irPath,
        status: 'changed',
        source: matchingChange?.source ?? 'external',
        observedAt: Date.now(),
        revision,
        content: raw,
        schema,
        ...(matchingChange ? { change: matchingChange } : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        irPath,
        status: message.startsWith('Invalid JSON:') ? 'invalid_json' : 'invalid_ir',
        source: 'external',
        observedAt: Date.now(),
        revision,
        content: raw,
        error: message,
      };
    }
  }

  async function doCheck(): Promise<void> {
    const event = await classify();
    if (stopped) return;
    if (event.revision === lastSeenRevision) return;

    lastSeenRevision = event.revision;
    if (event.revision === lastSelfWriteRevision) {
      lastSelfWriteRevision = null;
      return;
    }

    const key = `${event.status}:${event.revision}:${event.error ?? ''}`;
    if (key === lastEventKey) return;
    lastEventKey = key;
    onEvent(event);
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
      stopped = false;
      void classify().then((event) => {
        if (!stopped) lastSeenRevision = event.revision;
      });
      try {
        watcher = watch(irPath, () => scheduleCheck());
      } catch {
        // The file may be created later. Focus/manual checks still work.
      }
    },
    stop() {
      stopped = true;
      watcher?.close();
      watcher = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      lastSeenRevision = null;
      lastSelfWriteRevision = null;
      lastEventKey = null;
    },
    check: doCheck,
    acknowledgeSelfWrite(revision) {
      lastSelfWriteRevision = revision;
    },
  };
}

async function findMatchingChange(
  irPath: string,
  schema: Schema,
  readFile: (path: string) => Promise<string>,
): Promise<ModelChangeLogEntry | null> {
  const { log } = await loadModelChangeLog(irPath, { readFile });
  const afterHash = schemaHash(schema);
  return log.entries.find((entry) => entry.afterHash === afterHash) ?? null;
}
