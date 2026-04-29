/**
 * `createCompositeStageRunner` — dispatches shell-backed stages to the
 * spawn runner and runs in-process stages directly. Tests use fakes for
 * fs + spawner so dispatch is verified without touching disk or shelling out.
 */
import type { FsAdapter } from '@main/documents/document-store';
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { createCompositeStageRunner } from '@main/scaffold/composite-runner';
import { STAGE } from '@main/scaffold/scaffold-project';
import type { Spawner } from '@main/scaffold/spawn-runner';
import { beforeEach, describe, expect, it } from 'vitest';

const config = {
  targetDir: '/work/my-proj',
  projectName: 'my-proj',
  apps: ['web'] as const,
};

let fs: ReturnType<typeof createMemFsAdapter>;
let spawnCalls: Array<{ cmd: string; args: string[]; cwd: string }>;

function seedWebPackageJson(adapter: FsAdapter) {
  return adapter.writeFile(
    `${config.targetDir}/apps/web/package.json`,
    `${JSON.stringify({ name: 'web' }, null, 2)}\n`,
  );
}

beforeEach(() => {
  fs = createMemFsAdapter();
  spawnCalls = [];
});

function okSpawner(): Spawner {
  return (spec) => {
    spawnCalls.push({ cmd: spec.cmd, args: spec.args, cwd: spec.cwd });
    return (async function* () {
      yield* [];
    })();
  };
}

describe('createCompositeStageRunner', () => {
  it('TURBO_SKELETON runs in-process — writes root package.json, turbo.json, .gitignore', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.TURBO_SKELETON, config)) {
      // drain
    }
    expect(fs.exists('/work/my-proj/package.json')).toBe(true);
    expect(fs.exists('/work/my-proj/turbo.json')).toBe(true);
    expect(fs.exists('/work/my-proj/.gitignore')).toBe(true);
    expect(spawnCalls).toHaveLength(0);
  });

  it('WEB_NEXT dispatches to spawner (bunx create-next-app)', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.WEB_NEXT, config)) {
      // drain
    }
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].cmd).toBe('bunx');
    expect(spawnCalls[0].args[0]).toBe('create-next-app@latest');
  });

  it('MOBILE_EXPO dispatches to spawner (bunx create-expo-app)', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.MOBILE_EXPO, config)) {
      // drain
    }
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].args[0]).toBe('create-expo-app@latest');
  });

  it('DESKTOP_ELECTRON dispatches to spawner (bunx create-electron-app)', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.DESKTOP_ELECTRON, config)) {
      // drain
    }
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].args[0]).toBe('create-electron-app@latest');
  });

  it('CONVEX_INIT: seeds packages/contexture anchor + installs convex locally, then spawns convex dev', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.CONVEX_INIT, config)) {
      // drain
    }
    const pkg = JSON.parse(await fs.readFile('/work/my-proj/packages/contexture/package.json'));
    expect(pkg.dependencies.convex).toBeDefined();
    expect(spawnCalls).toHaveLength(2);
    expect(spawnCalls[0].cmd).toBe('bun');
    expect(spawnCalls[0].args).toEqual(['install']);
    expect(spawnCalls[0].cwd).toBe('/work/my-proj/packages/contexture');
    expect(spawnCalls[1].cmd).toBe('bunx');
    expect(spawnCalls[1].args[0]).toBe('convex@latest');
    expect(spawnCalls[1].cwd).toBe('/work/my-proj/packages/contexture');
  });

  it('SCHEMA_PACKAGE runs in-process — writes the schema package tree', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.SCHEMA_PACKAGE, config)) {
      // drain
    }
    expect(fs.exists('/work/my-proj/packages/contexture/my-proj.contexture.json')).toBe(true);
    expect(fs.exists('/work/my-proj/packages/contexture/package.json')).toBe(true);
    expect(spawnCalls).toHaveLength(0);
  });

  it('CONVEX_EMIT runs in-process — writes the Convex schema', async () => {
    await fs.writeFile(
      `${config.targetDir}/packages/contexture/my-proj.contexture.json`,
      JSON.stringify({ version: '1', types: [] }),
    );
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.CONVEX_EMIT, config)) {
      // drain
    }
    expect(fs.exists('/work/my-proj/packages/contexture/convex/schema.ts')).toBe(true);
    expect(spawnCalls).toHaveLength(0);
  });

  it('WORKSPACE_STITCH — stitch + git init trio via spawner', async () => {
    await seedWebPackageJson(fs);
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.WORKSPACE_STITCH, config)) {
      // drain
    }
    expect(fs.exists('/work/my-proj/CLAUDE.md')).toBe(true);
    expect(fs.exists('/work/my-proj/biome.json')).toBe(true);
    expect(fs.exists('/work/my-proj/.gitignore')).toBe(true);
    expect(spawnCalls.map((c) => c.args[0])).toEqual(['init', 'add', 'commit']);
    for (const c of spawnCalls) {
      expect(c.cmd).toBe('git');
      expect(c.cwd).toBe(config.targetDir);
    }
  });

  it('BUN_INSTALL dispatches to spawner (bun install)', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.BUN_INSTALL, config)) {
      // drain
    }
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].cmd).toBe('bun');
    expect(spawnCalls[0].args).toEqual(['install']);
  });

  it('LLM_SEED is a no-op — no spawner calls, no file writes', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(STAGE.LLM_SEED, config)) {
      // drain
    }
    expect(spawnCalls).toHaveLength(0);
  });
});
