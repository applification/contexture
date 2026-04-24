/**
 * Production `PreflightDeps` — the real-world implementations that
 * bind the pure `runPreflight` to `node:child_process`, `node:fs`,
 * `node:fs/promises` and `fetch`. Split out from `runPreflight` so the
 * unit tests can drive the logic with fakes and this file owns the
 * small amount of actual I/O.
 */
import { exec } from 'node:child_process';
import { promises as fsp, statSync } from 'node:fs';
import { promisify } from 'node:util';

import type { PreflightDeps } from './preflight';

const execAsync = promisify(exec);

export const nodePreflightDeps: PreflightDeps = {
  async runCommand(cmd) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 5000 });
      return { stdout, code: 0 };
    } catch (err) {
      const e = err as { code?: number; stdout?: string };
      return { stdout: e.stdout ?? '', code: e.code ?? 1 };
    }
  },
  async headOk(url) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  },
  async parentDirWritable(path) {
    try {
      await fsp.access(path, fsp.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
  async targetDirExists(path) {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  async freeBytes(_path) {
    // `node:fs.statfs` only lands in Node 18.15+; Electron bundles that,
    // but bun test may not. Fall back to a very large number if the API
    // is missing — preflight is advisory, not a hard gate.
    try {
      const statfs = (await import('node:fs/promises')).statfs;
      if (typeof statfs !== 'function') return Number.MAX_SAFE_INTEGER;
      const stat = await statfs(_path);
      return Number(stat.bavail) * Number(stat.bsize);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  },
};
