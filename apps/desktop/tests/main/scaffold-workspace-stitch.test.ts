/**
 * `scaffoldWorkspaceStitch` (stage 9) — when 'web' is in config.apps,
 * merges `@<project>/schema: workspace:*` into `apps/web/package.json`;
 * always writes the root `CLAUDE.md`, `biome.json`, and `.gitignore`.
 * Pure file manipulation; git init is handled by a separate step.
 */
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { scaffoldWorkspaceStitch } from '@main/scaffold/workspace-stitch';
import { beforeEach, describe, expect, it } from 'vitest';

const webConfig = { targetDir: '/work/my-proj', projectName: 'my-proj', apps: ['web'] as const };
const mobileConfig = {
  targetDir: '/work/my-proj',
  projectName: 'my-proj',
  apps: ['mobile'] as const,
};
const webPkgPath = '/work/my-proj/apps/web/package.json';

let fs: ReturnType<typeof createMemFsAdapter>;

beforeEach(() => {
  fs = createMemFsAdapter();
});

describe('scaffoldWorkspaceStitch', () => {
  it('adds @<project>/schema: workspace:* to apps/web/package.json dependencies when web selected', async () => {
    await fs.writeFile(
      webPkgPath,
      `${JSON.stringify({ name: 'web', dependencies: { next: '^16.0.0' } }, null, 2)}\n`,
    );
    await scaffoldWorkspaceStitch(webConfig, { fs });
    const pkg = JSON.parse(await fs.readFile(webPkgPath));
    expect(pkg.dependencies['@my-proj/schema']).toBe('workspace:*');
    expect(pkg.dependencies.next).toBe('^16.0.0');
    expect(pkg.name).toBe('web');
  });

  it('creates a dependencies object if apps/web/package.json lacked one', async () => {
    await fs.writeFile(webPkgPath, `${JSON.stringify({ name: 'web' }, null, 2)}\n`);
    await scaffoldWorkspaceStitch(webConfig, { fs });
    const pkg = JSON.parse(await fs.readFile(webPkgPath));
    expect(pkg.dependencies['@my-proj/schema']).toBe('workspace:*');
  });

  it('skips web package.json when web is not in apps', async () => {
    await scaffoldWorkspaceStitch(mobileConfig, { fs });
    expect(fs.exists(webPkgPath)).toBe(false);
  });

  it('writes the root CLAUDE.md with project name substituted', async () => {
    await fs.writeFile(webPkgPath, `${JSON.stringify({ name: 'web' }, null, 2)}\n`);
    await scaffoldWorkspaceStitch(webConfig, { fs });
    const claude = await fs.readFile('/work/my-proj/CLAUDE.md');
    expect(claude).toContain('my-proj');
    expect(claude).not.toContain('{{PROJECT_NAME}}');
  });

  it('writes biome.json at the project root', async () => {
    await fs.writeFile(webPkgPath, `${JSON.stringify({ name: 'web' }, null, 2)}\n`);
    await scaffoldWorkspaceStitch(webConfig, { fs });
    expect(fs.exists('/work/my-proj/biome.json')).toBe(true);
    const biome = JSON.parse(await fs.readFile('/work/my-proj/biome.json'));
    expect(biome.$schema).toMatch(/biomejs/);
  });

  it('writes a root .gitignore covering node_modules, .next, .convex', async () => {
    await fs.writeFile(webPkgPath, `${JSON.stringify({ name: 'web' }, null, 2)}\n`);
    await scaffoldWorkspaceStitch(webConfig, { fs });
    const gitignore = await fs.readFile('/work/my-proj/.gitignore');
    expect(gitignore).toMatch(/node_modules/);
    expect(gitignore).toMatch(/\.next/);
    expect(gitignore).toMatch(/\.convex/);
  });

  it('is idempotent — running twice leaves the web package.json unchanged', async () => {
    await fs.writeFile(
      webPkgPath,
      `${JSON.stringify({ name: 'web', dependencies: { next: '^16.0.0' } }, null, 2)}\n`,
    );
    await scaffoldWorkspaceStitch(webConfig, { fs });
    const first = await fs.readFile(webPkgPath);
    await scaffoldWorkspaceStitch(webConfig, { fs });
    const second = await fs.readFile(webPkgPath);
    expect(second).toBe(first);
  });
});
