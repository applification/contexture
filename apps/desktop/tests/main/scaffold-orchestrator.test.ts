/**
 * scaffoldProject — the composable orchestrator that derives a dynamic
 * stage list from config.apps, runs each stage, and writes
 * `.contexture/scaffold.log` regardless of outcome. Driven through an
 * in-memory `StageRunner` and fake log writer so we can assert the
 * event stream order + shape without shelling out.
 */
import {
  deriveStages,
  STAGE,
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

function okRunner(): StageRunner {
  return {
    run: async function* () {
      // Nothing to stream.
    },
  };
}

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

const webConfig = { targetDir: '/tmp/p', projectName: 'p', apps: ['web'] as const };
const allAppsConfig = {
  targetDir: '/tmp/p',
  projectName: 'p',
  apps: ['web', 'mobile', 'desktop'] as const,
};

describe('deriveStages', () => {
  it('web-only: includes turbo skeleton, web stages, convex + workspace stages', () => {
    const stages = deriveStages(['web']);
    expect(stages).toEqual([
      STAGE.TURBO_SKELETON,
      STAGE.WEB_NEXT,
      STAGE.WEB_SHADCN,
      STAGE.CONVEX_INIT,
      STAGE.SCHEMA_PACKAGE,
      STAGE.CONVEX_EMIT,
      STAGE.WORKSPACE_STITCH,
      STAGE.BUN_INSTALL,
      STAGE.LLM_SEED,
    ]);
  });

  it('mobile-only: no web stages, includes mobile expo stage', () => {
    const stages = deriveStages(['mobile']);
    expect(stages).toContain(STAGE.MOBILE_EXPO);
    expect(stages).not.toContain(STAGE.WEB_NEXT);
    expect(stages).not.toContain(STAGE.WEB_SHADCN);
  });

  it('all apps: includes all optional stages in order', () => {
    const stages = deriveStages(['web', 'mobile', 'desktop']);
    const idx = (s: number) => stages.indexOf(s);
    expect(idx(STAGE.WEB_NEXT)).toBeLessThan(idx(STAGE.MOBILE_EXPO));
    expect(idx(STAGE.MOBILE_EXPO)).toBeLessThan(idx(STAGE.DESKTOP_ELECTRON));
    expect(idx(STAGE.DESKTOP_ELECTRON)).toBeLessThan(idx(STAGE.CONVEX_INIT));
  });
});

describe('scaffoldProject', () => {
  it('emits stage-start and stage-done for every derived stage on the happy path and writes the log', async () => {
    const logWrites: Array<{ path: string; content: string }> = [];
    const stream = scaffoldProject(webConfig, {
      runner: okRunner(),
      writeLog: async (path, content) => logWrites.push({ path, content }),
    });
    const events = await collect(stream);
    const expectedStages = deriveStages(['web']);
    const starts = events.filter((e) => e.kind === 'stage-start').map((e) => e.stage);
    const dones = events.filter((e) => e.kind === 'stage-done').map((e) => e.stage);
    expect(starts).toEqual(expectedStages);
    expect(dones).toEqual(expectedStages);
    expect(events.at(-1)?.kind).toBe('scaffold-done');
    expect(logWrites).toHaveLength(1);
    expect(logWrites[0].path).toBe('/tmp/p/.contexture/scaffold.log');
  });

  it('does not emit scaffold-done when a stage fails', async () => {
    const stream = scaffoldProject(webConfig, {
      runner: failAtRunner(STAGE.WEB_NEXT),
      writeLog: async () => undefined,
    });
    const events = await collect(stream);
    expect(events.some((e) => e.kind === 'scaffold-done')).toBe(false);
  });

  it('stops at the first failing stage, emits stage-failed, and still writes the log', async () => {
    const logWrites: Array<{ path: string; content: string }> = [];
    const stream = scaffoldProject(webConfig, {
      runner: failAtRunner(STAGE.WEB_NEXT, 'next-app exited 1'),
      writeLog: async (path, content) => logWrites.push({ path, content }),
    });
    const events = await collect(stream);
    const starts = events.filter((e) => e.kind === 'stage-start').map((e) => e.stage);
    const failed = events.find((e) => e.kind === 'stage-failed');
    expect(starts).toEqual([STAGE.TURBO_SKELETON, STAGE.WEB_NEXT]);
    expect(failed?.kind).toBe('stage-failed');
    if (failed?.kind === 'stage-failed') {
      expect(failed.stage).toBe(STAGE.WEB_NEXT);
      expect(failed.stderr).toContain('next-app exited 1');
    }
    expect(logWrites).toHaveLength(1);
    expect(logWrites[0].content).toContain('next-app exited 1');
  });

  it('stage 1 (TURBO_SKELETON) is not retry-safe; all others are', async () => {
    async function firstFailedAt(stage: number) {
      const events = await collect(
        scaffoldProject(allAppsConfig, {
          runner: failAtRunner(stage),
          writeLog: async () => undefined,
        }),
      );
      const failed = events.find((e) => e.kind === 'stage-failed');
      if (failed?.kind !== 'stage-failed') throw new Error('expected stage-failed');
      return failed;
    }
    expect((await firstFailedAt(STAGE.TURBO_SKELETON)).retrySafe).toBe(false);
    expect((await firstFailedAt(STAGE.WEB_NEXT)).retrySafe).toBe(true);
    expect((await firstFailedAt(STAGE.CONVEX_INIT)).retrySafe).toBe(true);
    expect((await firstFailedAt(STAGE.BUN_INSTALL)).retrySafe).toBe(true);
  });

  it('derives correct stage list for all-apps config', async () => {
    const stream = scaffoldProject(allAppsConfig, {
      runner: okRunner(),
      writeLog: async () => undefined,
    });
    const events = await collect(stream);
    const starts = events.filter((e) => e.kind === 'stage-start').map((e) => e.stage);
    expect(starts).toEqual(deriveStages(['web', 'mobile', 'desktop']));
  });
});
