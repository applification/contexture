/**
 * In-memory `FsAdapter` for tests — stores files in a Map, emulates the
 * `ENOENT` / `rename` semantics the real adapter gives, and lets tests
 * inject write failures for atomic-save rollback exercises.
 *
 * Not production code: the only caller is `document-store.test.ts`.
 */
import type { FsAdapter } from './document-store';

export interface MemFsAdapter extends FsAdapter {
  exists(path: string): boolean;
  failWritesMatching(regex: RegExp): void;
  listTmp(): string[];
}

export function createMemFsAdapter(seed: Record<string, string> = {}): MemFsAdapter {
  const files = new Map<string, string>(Object.entries(seed));
  let failPattern: RegExp | null = null;

  return {
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) {
        const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return content;
    },
    async writeFile(path, content) {
      if (failPattern?.test(path)) {
        throw new Error(`simulated write failure: ${path}`);
      }
      files.set(path, content);
    },
    async rename(from, to) {
      const content = files.get(from);
      if (content === undefined) {
        const err = new Error(`ENOENT: ${from}`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      files.delete(from);
      files.set(to, content);
    },
    async remove(path) {
      files.delete(path);
    },
    async fileExists(path) {
      return files.has(path);
    },
    async dirExists(path) {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    },

    exists(path) {
      return files.has(path);
    },
    failWritesMatching(regex) {
      failPattern = regex;
    },
    listTmp() {
      return [...files.keys()].filter((k) => k.endsWith('.tmp'));
    },
  };
}
