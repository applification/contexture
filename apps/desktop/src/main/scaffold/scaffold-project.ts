/**
 * `scaffoldProject` — the composable project scaffolder. Derives a
 * dynamic stage list from the selected app kinds, then streams
 * `StageEvent`s per stage so the renderer can show live progress, and
 * writes `.contexture/scaffold.log` on both success and failure paths.
 *
 * Stage implementations are injected via `StageRunner` so the
 * orchestrator is unit-testable without shelling out.
 *
 * Failure policy: any stage throwing aborts the chain. The TurboRepo
 * skeleton stage (1) is "start over only". Stages 2+ are retry-safe
 * against the same directory.
 */

export type AppKind = 'web' | 'mobile' | 'desktop';

export interface ScaffoldConfig {
  targetDir: string;
  projectName: string;
  apps: AppKind[];
  /** Initial user prompt seeded into chat.json when the project is created. */
  description?: string;
}

/**
 * Fixed stage numbers. Optional app stages (WEB_*, MOBILE, DESKTOP)
 * are included only when the corresponding app kind is selected.
 */
export const STAGE = {
  TURBO_SKELETON: 1,
  WEB_NEXT: 2,
  WEB_SHADCN: 3,
  MOBILE_EXPO: 4,
  DESKTOP_ELECTRON: 5,
  CONVEX_INIT: 6,
  SCHEMA_PACKAGE: 7,
  CONVEX_EMIT: 8,
  WORKSPACE_STITCH: 9,
  BUN_INSTALL: 10,
  LLM_SEED: 11,
} as const;

export type StageNumber = (typeof STAGE)[keyof typeof STAGE];

/** First stage that is safe to retry against the same target dir. */
const FIRST_RETRY_SAFE_STAGE: StageNumber = STAGE.WEB_NEXT;

/** Derive the ordered stage list for a given app selection. */
export function deriveStages(apps: AppKind[]): StageNumber[] {
  const stages: StageNumber[] = [STAGE.TURBO_SKELETON];
  if (apps.includes('web')) {
    stages.push(STAGE.WEB_NEXT, STAGE.WEB_SHADCN);
  }
  if (apps.includes('mobile')) {
    stages.push(STAGE.MOBILE_EXPO);
  }
  if (apps.includes('desktop')) {
    stages.push(STAGE.DESKTOP_ELECTRON);
  }
  stages.push(
    STAGE.CONVEX_INIT,
    STAGE.SCHEMA_PACKAGE,
    STAGE.CONVEX_EMIT,
    STAGE.WORKSPACE_STITCH,
    STAGE.BUN_INSTALL,
    STAGE.LLM_SEED,
  );
  return stages;
}

export type StageEvent =
  | { kind: 'stage-start'; stage: StageNumber }
  | { kind: 'stdout-chunk'; stage: StageNumber; chunk: string }
  | { kind: 'stderr-chunk'; stage: StageNumber; chunk: string }
  | { kind: 'stage-done'; stage: StageNumber }
  | { kind: 'stage-failed'; stage: StageNumber; stderr: string; retrySafe: boolean }
  | { kind: 'scaffold-done' };

/** Yielded by a stage runner during its run — stage number is stamped on by the orchestrator. */
export type StageChunk =
  | { kind: 'stdout-chunk'; chunk: string }
  | { kind: 'stderr-chunk'; chunk: string };

export interface StageRunner {
  run(stage: StageNumber, config: ScaffoldConfig): AsyncIterable<StageChunk>;
}

export interface ScaffoldDeps {
  runner: StageRunner;
  /** Writes the scaffold log — called once at end of run regardless of outcome. */
  writeLog: (path: string, content: string) => Promise<void>;
}

export async function* scaffoldProject(
  config: ScaffoldConfig,
  deps: ScaffoldDeps,
): AsyncIterable<StageEvent> {
  const stages = deriveStages(config.apps);
  const buffered: StageEvent[] = [];
  let failedStderr = '';

  for (const stage of stages) {
    const startEvent: StageEvent = { kind: 'stage-start', stage };
    buffered.push(startEvent);
    yield startEvent;

    try {
      for await (const chunk of deps.runner.run(stage, config)) {
        const ev: StageEvent = { ...chunk, stage };
        buffered.push(ev);
        if (chunk.kind === 'stderr-chunk') failedStderr += chunk.chunk;
        yield ev;
      }
      const done: StageEvent = { kind: 'stage-done', stage };
      buffered.push(done);
      yield done;
      failedStderr = '';
    } catch {
      const retrySafe = stage >= FIRST_RETRY_SAFE_STAGE;
      const failed: StageEvent = {
        kind: 'stage-failed',
        stage,
        stderr: failedStderr,
        retrySafe,
      };
      buffered.push(failed);
      yield failed;
      await deps
        .writeLog(`${config.targetDir}/.contexture/scaffold.log`, formatLog(buffered))
        .catch(() => undefined);
      return;
    }
  }

  await deps
    .writeLog(`${config.targetDir}/.contexture/scaffold.log`, formatLog(buffered))
    .catch(() => undefined);
  yield { kind: 'scaffold-done' };
}

function formatLog(events: ReadonlyArray<StageEvent>): string {
  const lines: string[] = [];
  for (const ev of events) {
    switch (ev.kind) {
      case 'stage-start':
        lines.push(`[stage ${ev.stage}] start`);
        break;
      case 'stage-done':
        lines.push(`[stage ${ev.stage}] done`);
        break;
      case 'stdout-chunk':
        lines.push(`[stage ${ev.stage}] stdout: ${ev.chunk}`);
        break;
      case 'stderr-chunk':
        lines.push(`[stage ${ev.stage}] stderr: ${ev.chunk}`);
        break;
      case 'stage-failed':
        lines.push(`[stage ${ev.stage}] FAILED (retry-safe=${ev.retrySafe}): ${ev.stderr.trim()}`);
        break;
    }
  }
  return `${lines.join('\n')}\n`;
}
