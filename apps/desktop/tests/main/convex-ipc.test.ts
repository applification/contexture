import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConvexVersionInfo } from '@main/ipc/convex';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

describe('Convex version IPC helpers', () => {
  it('reports matching target app Convex versions from package.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const appDir = join(dir, 'apps/plantry');
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'package.json'),
      JSON.stringify({ dependencies: { convex: '^1.40.0' } }),
      'utf8',
    );

    const result = await getConvexVersionInfo({
      irPath: join(appDir, 'plantry.contexture.json'),
    });

    expect(result).toMatchObject({
      emitterVersion: '1.40.0',
      targetVersion: '^1.40.0',
      status: 'ok',
    });
  });

  it('reports mismatched target app Convex versions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const appDir = join(dir, 'apps/plantry');
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'package.json'),
      JSON.stringify({ devDependencies: { convex: '1.37.0' } }),
      'utf8',
    );

    const result = await getConvexVersionInfo({
      irPath: join(appDir, 'plantry.contexture.json'),
    });

    expect(result).toMatchObject({
      emitterVersion: '1.40.0',
      targetVersion: '1.37.0',
      status: 'mismatch',
    });
  });
});
