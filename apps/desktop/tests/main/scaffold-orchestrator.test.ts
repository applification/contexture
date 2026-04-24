/**
 * scaffoldProject — the ten-stage orchestrator that runs the preflight,
 * each stage, and writes `.contexture/scaffold.log` regardless of
 * outcome. This test drives it through an in-memory `StageRunner` and
 * fake log writer so we can assert the event stream order + shape
 * without actually shelling out. Real stage wiring comes in later
 * slices.
 */
import {
  type StageEvent,
  type StageRunner,
  scaffoldProject,
} from '@main/scaffold/scaffold-project';
import { describe, expect, it } from 'vitest';

function collect(stream: AsyncIterable<StageEvent>): Promise<StageEvent[]> {
  return (async () => {
    const events: StageEvent[] = [];
    for await (const ev of stream) events.push(ev);
    return events;
  })();
}

/** Makes a runner that succeeds for every stage. */
function okRunner(): StageRunner {
  return {
    run: async function* () {
      // Nothing to stream.
    },
  };
}

/** Makes a runner that succeeds on stage N, then fails on stage N+1. */
function failAtRunner(failStage: number, stderr = 'boom'): StageRunner {
  return {
    run: async function* (stage) {
      if (stage === failStage) {
        yield { kind: 'stderr-chunk', chunk: stderr };
        throw new Error(`stage ${stage} failed`);
      }
    },
  };
}

describe('scaffoldProject', () => {
  it('emits stage-start and stage-done for every stage on the happy path and writes the log', async () => {
    const logWrites: Array<{ path: string; content: string }> = [];
    const stream = scaffoldProject(
      { targetDir: '/tmp/p', projectName: 'p' },
      {
        runner: okRunner(),
        writeLog: async (path, content) => logWrites.push({ path, content }),
      },
    );
    const events = await collect(stream);
    const starts = events.filter((e) => e.kind === 'stage-start').map((e) => e.stage);
    const dones = events.filter((e) => e.kind === 'stage-done').map((e) => e.stage);
    expect(starts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(dones).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(logWrites).toHaveLength(1);
    expect(logWrites[0].path).toBe('/tmp/p/.contexture/scaffold.log');
  });

  it('stops at the first failing stage, emits stage-failed, and still writes the log', async () => {
    const logWrites: Array<{ path: string; content: string }> = [];
    const stream = scaffoldProject(
      { targetDir: '/tmp/p', projectName: 'p' },
      {
        runner: failAtRunner(3, 'next-app exited 1'),
        writeLog: async (path, content) => logWrites.push({ path, content }),
      },
    );
    const events = await collect(stream);
    const starts = events.filter((e) => e.kind === 'stage-start').map((e) => e.stage);
    const failed = events.find((e) => e.kind === 'stage-failed');
    // Stages 1 and 2 ran, stage 3 started + failed; nothing after stage 3.
    expect(starts).toEqual([1, 2, 3]);
    expect(failed?.kind).toBe('stage-failed');
    if (failed?.kind === 'stage-failed') {
      expect(failed.stage).toBe(3);
      expect(failed.stderr).toContain('next-app exited 1');
    }
    expect(logWrites).toHaveLength(1);
    expect(logWrites[0].content).toContain('next-app exited 1');
  });

  it('stage-failed carries the retry-safe flag (false for 1-4, true for 5+)', async () => {
    async function firstFailedAt(stage: number) {
      const events = await collect(
        scaffoldProject(
          { targetDir: '/tmp/p', projectName: 'p' },
          { runner: failAtRunner(stage), writeLog: async () => undefined },
        ),
      );
      const failed = events.find((e) => e.kind === 'stage-failed');
      if (failed?.kind !== 'stage-failed') throw new Error('expected stage-failed');
      return failed;
    }
    expect((await firstFailedAt(1)).retrySafe).toBe(false);
    expect((await firstFailedAt(4)).retrySafe).toBe(false);
    expect((await firstFailedAt(5)).retrySafe).toBe(true);
    expect((await firstFailedAt(9)).retrySafe).toBe(true);
  });
});
