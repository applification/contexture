/**
 * `createCompositeStageRunner` — the production StageRunner: delegates
 * shell-backed stages (1-5, 9) to the spawn runner, runs the in-process
 * stages (6 scaffold, 7 convex emit, 8 workspace stitch + git init,
 * 10 no-op) directly, and gives the orchestrator a single runner to
 * drive. Testing through fakes for fs + spawner so we can assert
 * dispatch without touching disk or shelling out.
 */
import type { FsAdapter } from '@main/documents/document-store';
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { createCompositeStageRunner } from '@main/scaffold/composite-runner';
import type { Spawner } from '@main/scaffold/spawn-runner';
import { beforeEach, describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj' };

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
  it('dispatches stage 1 to the spawner (bunx create-turbo)', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(1, config)) {
      // drain
    }
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].cmd).toBe('bunx');
    expect(spawnCalls[0].args[0]).toBe('create-turbo@latest');
  });

  it('runs stage 6 in-process — writes the schema package tree', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(6, config)) {
      // drain
    }
    expect(fs.exists('/work/my-proj/packages/schema/my-proj.contexture.json')).toBe(true);
    expect(fs.exists('/work/my-proj/packages/schema/package.json')).toBe(true);
    // Spawner must not have been touched for in-process stages.
    expect(spawnCalls).toHaveLength(0);
  });

  it('runs stage 7 in-process — writes the Convex schema', async () => {
    // Stage 6 runs first in the real flow; emulate it.
    await fs.writeFile(
      `${config.targetDir}/packages/schema/my-proj.contexture.json`,
      JSON.stringify({ version: '1', types: [] }),
    );
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(7, config)) {
      // drain
    }
    expect(fs.exists('/work/my-proj/packages/schema/convex/schema.ts')).toBe(true);
    expect(spawnCalls).toHaveLength(0);
  });

  it('runs stage 8 — stitch + git init trio via spawner', async () => {
    await seedWebPackageJson(fs);
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(8, config)) {
      // drain
    }
    // Files written by stitch half.
    expect(fs.exists('/work/my-proj/CLAUDE.md')).toBe(true);
    expect(fs.exists('/work/my-proj/biome.json')).toBe(true);
    expect(fs.exists('/work/my-proj/.gitignore')).toBe(true);
    // Git trio dispatched to spawner.
    expect(spawnCalls.map((c) => c.args[0])).toEqual(['init', 'add', 'commit']);
    for (const c of spawnCalls) {
      expect(c.cmd).toBe('git');
      expect(c.cwd).toBe(config.targetDir);
    }
  });

  it('dispatches stage 9 to the spawner (bun install)', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(9, config)) {
      // drain
    }
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].cmd).toBe('bun');
    expect(spawnCalls[0].args).toEqual(['install']);
  });

  it('stage 10 is a no-op in v1 — no spawner, no file writes', async () => {
    const runner = createCompositeStageRunner({ fs, spawner: okSpawner() });
    for await (const _ of runner.run(10, config)) {
      // drain
    }
    expect(spawnCalls).toHaveLength(0);
  });
});
