/**
 * `spawnStageRunner` — a StageRunner backed by `shellStageSpecFor` +
 * an injected spawner. This test drives a fake spawner so we exercise
 * the runner's contract (correct cmd/args/cwd, stdout/stderr streamed
 * as StageChunks, non-zero exit throws) without actually forking a
 * process. Real spawn wiring is a one-liner in production.
 */
import { createSpawnStageRunner, type Spawner } from '@main/scaffold/spawn-runner';
import { describe, expect, it } from 'vitest';

const config = { targetDir: '/work/p', projectName: 'p' };

function fakeSpawner(
  fn: (args: Parameters<Spawner>[0]) => {
    stdout?: string[];
    stderr?: string[];
    code: number;
  },
): Spawner {
  return async function* (call) {
    const result = fn(call);
    for (const chunk of result.stdout ?? []) yield { kind: 'stdout-chunk', chunk };
    for (const chunk of result.stderr ?? []) yield { kind: 'stderr-chunk', chunk };
    if (result.code !== 0) throw new Error(`process exited with code ${result.code}`);
  };
}

describe('spawnStageRunner', () => {
  it('feeds the stage spec into the spawner and streams chunks through', async () => {
    const calls: Array<{ cmd: string; args: string[]; cwd: string }> = [];
    const spawner = fakeSpawner((call) => {
      calls.push(call);
      return { stdout: ['creating...\n', 'done.\n'], code: 0 };
    });
    const runner = createSpawnStageRunner(spawner);
    const chunks: Array<string> = [];
    for await (const ev of runner.run(1, config)) {
      if (ev.kind === 'stdout-chunk') chunks.push(ev.chunk);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('bunx');
    expect(calls[0].args[0]).toBe('create-turbo@latest');
    expect(calls[0].cwd).toBe('/work');
    expect(chunks).toEqual(['creating...\n', 'done.\n']);
  });

  it('propagates a non-zero exit as a thrown error', async () => {
    const spawner = fakeSpawner(() => ({ stderr: ['next-app: EACCES\n'], code: 1 }));
    const runner = createSpawnStageRunner(spawner);
    let threw = false;
    try {
      for await (const _ of runner.run(3, config)) {
        // drain
      }
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/code 1/);
    }
    expect(threw).toBe(true);
  });
});
