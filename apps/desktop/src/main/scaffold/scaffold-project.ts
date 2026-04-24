/**
 * `scaffoldProject` — the ten-stage project scaffolder. Streams
 * `StageEvent`s per stage so the renderer can show live progress, and
 * writes `.contexture/scaffold.log` on both success and failure paths.
 *
 * Stage implementations are injected via `StageRunner` so the
 * orchestrator is unit-testable without shelling out; real runners
 * wire `child_process.spawn` + the project emitters in later slices.
 *
 * Failure policy: any stage throwing aborts the chain. Stages 1-4
 * (turbo/rm/next/shadcn) are "start over only" — a failed run should
 * be wiped and retried fresh. Stages 5+ (`convex dev`, scaffold
 * emitters, git init, `bun install`) are retry-safe against the same
 * directory.
 */

export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const STAGE_NUMBERS: readonly StageNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** First stage that is safe to retry against the same target dir. */
const FIRST_RETRY_SAFE_STAGE: StageNumber = 5;

export interface ScaffoldConfig {
  targetDir: string;
  projectName: string;
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
  const buffered: StageEvent[] = [];
  let failedStderr = '';

  for (const stage of STAGE_NUMBERS) {
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
