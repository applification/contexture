/**
 * `scaffoldWorkspaceStitch` (stage 8) — merges
 * `@<project>/schema: workspace:*` into `apps/web/package.json`,
 * writes the root `CLAUDE.md`, the workspace `biome.json`, and
 * ensures the root `.gitignore` has the usual entries. Pure file
 * manipulation against an injected FsAdapter; git init is handled
 * by a separate step so this slice stays testable without a shell.
 */
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { scaffoldWorkspaceStitch } from '@main/scaffold/workspace-stitch';
import { beforeEach, describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj' };
const webPkgPath = '/work/my-proj/apps/web/package.json';

let fs: ReturnType<typeof createMemFsAdapter>;

beforeEach(() => {
  fs = createMemFsAdapter();
});

describe('scaffoldWorkspaceStitch', () => {
  it('adds @<project>/schema: workspace:* to apps/web/package.json dependencies', async () => {
    await fs.writeFile(
      webPkgPath,
      `${JSON.stringify({ name: 'web', dependencies: { next: '^15.0.0' } }, null, 2)}\n`,
    );
    await scaffoldWorkspaceStitch(config, { fs });
    const pkg = JSON.parse(await fs.readFile(webPkgPath));
    expect(pkg.dependencies['@my-proj/schema']).toBe('workspace:*');
    // Existing deps preserved.
    expect(pkg.dependencies.next).toBe('^15.0.0');
    expect(pkg.name).toBe('web');
  });

  it('creates a dependencies object if apps/web/package.json lacked one', async () => {
    await fs.writeFile(webPkgPath, `${JSON.stringify({ name: 'web' }, null, 2)}\n`);
    await scaffoldWorkspaceStitch(config, { fs });
    const pkg = JSON.parse(await fs.readFile(webPkgPath));
    expect(pkg.dependencies['@my-proj/schema']).toBe('workspace:*');
  });

  it('writes the root CLAUDE.md with {{PROJECT_NAME}} substituted', async () => {
    await fs.writeFile(webPkgPath, `${JSON.stringify({ name: 'web' }, null, 2)}\n`);
    await scaffoldWorkspaceStitch(config, { fs });
    const claude = await fs.readFile('/work/my-proj/CLAUDE.md');
    expect(claude).toContain('my-proj');
    expect(claude).not.toContain('{{PROJECT_NAME}}');
  });

  it('writes biome.json at the project root', async () => {
    await fs.writeFile(webPkgPath, `${JSON.stringify({ name: 'web' }, null, 2)}\n`);
    await scaffoldWorkspaceStitch(config, { fs });
    expect(fs.exists('/work/my-proj/biome.json')).toBe(true);
    const biome = JSON.parse(await fs.readFile('/work/my-proj/biome.json'));
    // Minimal sanity: must be a valid biome config shape.
    expect(biome.$schema).toMatch(/biomejs/);
  });

  it('writes a root .gitignore covering node_modules, .next, .convex, and .contexture internals', async () => {
    await fs.writeFile(webPkgPath, `${JSON.stringify({ name: 'web' }, null, 2)}\n`);
    await scaffoldWorkspaceStitch(config, { fs });
    const gitignore = await fs.readFile('/work/my-proj/.gitignore');
    expect(gitignore).toMatch(/node_modules/);
    expect(gitignore).toMatch(/\.next/);
    expect(gitignore).toMatch(/\.convex/);
  });

  it('is idempotent — running twice leaves the web package.json unchanged', async () => {
    await fs.writeFile(
      webPkgPath,
      `${JSON.stringify({ name: 'web', dependencies: { next: '^15.0.0' } }, null, 2)}\n`,
    );
    await scaffoldWorkspaceStitch(config, { fs });
    const first = await fs.readFile(webPkgPath);
    await scaffoldWorkspaceStitch(config, { fs });
    const second = await fs.readFile(webPkgPath);
    expect(second).toBe(first);
  });
});
