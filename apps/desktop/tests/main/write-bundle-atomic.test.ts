import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBundleAtomic } from '@main/save-bundle';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('writeBundleAtomic', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'contexture-save-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes every file to its destination path', async () => {
    await writeBundleAtomic({
      files: [
        { path: join(dir, 'a.txt'), content: 'A' },
        { path: join(dir, 'b.txt'), content: 'B' },
      ],
    });
    expect(readFileSync(join(dir, 'a.txt'), 'utf-8')).toBe('A');
    expect(readFileSync(join(dir, 'b.txt'), 'utf-8')).toBe('B');
  });

  it('replaces existing files atomically (no .tmp left on success)', async () => {
    writeFileSync(join(dir, 'a.txt'), 'old');
    await writeBundleAtomic({
      files: [{ path: join(dir, 'a.txt'), content: 'new' }],
    });
    expect(readFileSync(join(dir, 'a.txt'), 'utf-8')).toBe('new');
    // No tmp artifacts linger.
    const leftover = readdirSync(dir).filter((n) => n.includes('.tmp'));
    expect(leftover).toEqual([]);
  });

  it('rolls back every file when a later write fails', async () => {
    writeFileSync(join(dir, 'a.txt'), 'original-a');
    // b.txt does not exist pre-save.
    const bad = join(dir, 'nope/nested/c.txt'); // parent does not exist → write fails
    await expect(
      writeBundleAtomic({
        files: [
          { path: join(dir, 'a.txt'), content: 'new-a' },
          { path: join(dir, 'b.txt'), content: 'new-b' },
          { path: bad, content: 'new-c' },
        ],
      }),
    ).rejects.toThrow();

    // a.txt restored to original.
    expect(readFileSync(join(dir, 'a.txt'), 'utf-8')).toBe('original-a');
    // b.txt did not exist before and must not exist after rollback.
    expect(existsSync(join(dir, 'b.txt'))).toBe(false);
    // No tmp artifacts linger.
    const leftover = readdirSync(dir).filter((n) => n.includes('.tmp'));
    expect(leftover).toEqual([]);
  });
});
