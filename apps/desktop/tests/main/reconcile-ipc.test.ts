import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  type EmittedManifest,
  type GeneratedBundleFs,
  hashContent,
  manifestKeyForGeneratedPath,
  type Schema,
  writeGeneratedBundle,
} from '@contexture/core';
import {
  acceptGeneratedTarget,
  readGeneratedTarget,
  validateConvexGeneratedTarget,
  writeGeneratedTarget,
} from '@main/ipc/reconcile';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

const nodeTestFs: GeneratedBundleFs = {
  readFile: (path) => readFile(path, 'utf8'),
  async writeFile(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  },
  async rename(from, to) {
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
  },
  remove: (path) => rm(path, { force: true }),
  mkdirp: (path) => mkdir(path, { recursive: true }).then(() => undefined),
};

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

  it('updates the emitted manifest hash when regenerating a target', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-reconcile-'));
    const ctxDir = join(dir, 'packages/contexture');
    const contextureDir = join(ctxDir, '.contexture');
    await mkdir(contextureDir, { recursive: true });
    const irPath = join(ctxDir, 'garden.contexture.json');
    const targetPath = join(ctxDir, 'garden.schema.ts');
    const manifestPath = join(contextureDir, 'emitted.json');
    await writeFile(irPath, '{"version":"1","types":[]}\n', 'utf8');
    await writeFile(targetPath, 'before\n', 'utf8');
    await writeFile(
      manifestPath,
      `${JSON.stringify({ version: '1', files: { [targetPath]: hashContent('before\n') } }, null, 2)}\n`,
      'utf8',
    );

    await writeGeneratedTarget({ irPath, targetPath, contents: 'after\n' });

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as EmittedManifest;
    expect(manifest.files[manifestKeyForGeneratedPath(irPath, targetPath)]).toBe(
      hashContent('after\n'),
    );
  });

  it('runs one-shot Convex CLI validation only through the explicit validation IPC helper', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-reconcile-'));
    const ctxDir = join(dir, 'packages/contexture');
    await mkdir(ctxDir, { recursive: true });
    const irPath = join(ctxDir, 'garden.contexture.json');
    const targetPath = join(ctxDir, 'convex/schema.ts');
    const execFile = vi.fn().mockResolvedValue({ stdout: 'validated\n', stderr: '' });
    await writeFile(irPath, '{"version":"1","types":[]}\n', 'utf8');
    await writeFile(
      join(ctxDir, 'package.json'),
      JSON.stringify({ dependencies: { convex: '^1.0.0' } }),
      'utf8',
    );

    await writeGeneratedTarget({ irPath, targetPath, contents: 'export default null;\n' });
    expect(execFile).not.toHaveBeenCalled();

    const result = await validateConvexGeneratedTarget(
      { irPath, targetPath },
      { execFile, env: { CONVEX_DEPLOYMENT: 'dev:test' } },
    );

    expect(execFile).toHaveBeenCalledWith(
      'npx',
      ['--no-install', 'convex', 'dev', '--once'],
      expect.objectContaining({ cwd: ctxDir }),
    );
    expect(result).toMatchObject({
      status: 'passed',
      command: 'npx --no-install convex dev --once',
    });
  });

  it('skips Convex CLI validation when the project is not configured for Convex', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-reconcile-'));
    const ctxDir = join(dir, 'packages/contexture');
    await mkdir(ctxDir, { recursive: true });
    const irPath = join(ctxDir, 'garden.contexture.json');
    const targetPath = join(ctxDir, 'convex/schema.ts');
    const execFile = vi.fn().mockResolvedValue({ stdout: 'validated\n', stderr: '' });
    await writeFile(irPath, '{"version":"1","types":[]}\n', 'utf8');

    const result = await validateConvexGeneratedTarget(
      { irPath, targetPath },
      { execFile, env: {} },
    );

    expect(execFile).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'No project package.json found.',
    });
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

  it('accepts a reconciled target by saving the IR and full generated bundle', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-reconcile-'));
    const ctxDir = join(dir, 'packages/contexture');
    await mkdir(ctxDir, { recursive: true });
    const irPath = join(ctxDir, 'garden.contexture.json');
    const targetPath = join(ctxDir, 'garden.schema.ts');
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Plot',
          table: true,
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
      ],
    };

    await acceptGeneratedTarget({
      irPath,
      targetPath,
      contents: '// accepted target\n',
      schema,
    });

    await expect(readFile(irPath, 'utf8')).resolves.toContain('"title"');
    await expect(readFile(join(ctxDir, 'convex/schema.ts'), 'utf8')).resolves.toContain('title');
    await expect(readFile(targetPath, 'utf8')).resolves.toContain('@contexture-generated');
  });

  it('restores the selected target and manifest if full-bundle save finds other drift', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-reconcile-'));
    const ctxDir = join(dir, 'packages/contexture');
    const irPath = join(ctxDir, 'garden.contexture.json');
    const targetPath = join(ctxDir, 'garden.schema.ts');
    const manifestPath = join(ctxDir, '.contexture/emitted.json');
    const schema: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Plot', table: true, fields: [] }],
    };
    await writeGeneratedBundle({ irPath, schema, fs: nodeTestFs });
    const previousTarget = await readFile(targetPath, 'utf8');
    const previousManifest = await readFile(manifestPath, 'utf8');
    await writeFile(join(ctxDir, 'garden.schema.json'), '{"hand":"edit"}\n', 'utf8');

    await expect(
      acceptGeneratedTarget({
        irPath,
        targetPath,
        contents: '// accepted target\n',
        schema,
      }),
    ).rejects.toThrow(/Generated files have drifted/);

    await expect(readFile(targetPath, 'utf8')).resolves.toBe(previousTarget);
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(previousManifest);
  });
});
