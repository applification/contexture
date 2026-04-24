/**
 * `FsAdapter` backed by Node's real filesystem. Thin wrapper — the
 * interesting behaviour (atomic bundle, rollback) lives in
 * `document-store.ts`; this file is just the Node-specific plumbing.
 */
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { FsAdapter } from './document-store';

export const nodeFsAdapter: FsAdapter = {
  async readFile(path) {
    return fs.readFile(path, 'utf-8');
  },
  async writeFile(path, content) {
    // Project-mode seeding may target paths like
    // `apps/web/convex/<table>.ts` whose parent directories don't exist
    // yet on first open. Mirror MemFsAdapter's implicit-parent semantics.
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, content, 'utf-8');
  },
  async rename(from, to) {
    await fs.rename(from, to);
  },
  async remove(path) {
    await fs.rm(path, { force: true });
  },
  async fileExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  async dirExists(path) {
    try {
      const stat = await fs.stat(path);
      return stat.isDirectory();
    } catch {
      return false;
    }
  },
};
