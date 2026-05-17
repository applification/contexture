import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGeneratedTarget, writeGeneratedTarget } from '@main/ipc/reconcile';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

describe('reconcile generated-target IPC helpers', () => {
  it('reads and writes known generated targets for the open IR', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-reconcile-'));
    const ctxDir = join(dir, 'packages/contexture');
    await mkdir(ctxDir, { recursive: true });
    const irPath = join(ctxDir, 'garden.contexture.json');
    const targetPath = join(ctxDir, 'garden.schema.ts');
    await writeFile(irPath, '{"version":"1","types":[]}\n', 'utf8');
    await writeFile(targetPath, 'before\n', 'utf8');

    await expect(readGeneratedTarget({ irPath, targetPath })).resolves.toBe('before\n');
    await writeGeneratedTarget({ irPath, targetPath, contents: 'after\n' });
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('after\n');
  });

  it('rejects writes outside the generated bundle', async () => {
    const irPath = '/repo/packages/contexture/garden.contexture.json';
    await expect(
      writeGeneratedTarget({
        irPath,
        targetPath: '/repo/packages/contexture/src/index.ts',
        contents: 'nope',
      }),
    ).rejects.toThrow(/not a generated Contexture artifact/);
  });

  it('rejects malformed write payloads at the IPC boundary', async () => {
    await expect(
      writeGeneratedTarget({
        irPath: '/repo/packages/contexture/garden.contexture.json',
        targetPath: '/repo/packages/contexture/garden.schema.ts',
      }),
    ).rejects.toThrow(/Invalid reconcile:write-generated-target payload: contents:/);
  });
});
