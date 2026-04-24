/**
 * `createSpawnStageRunner` — the default StageRunner for shell-backed
 * stages (1-5, 9). Delegates to an injected `Spawner` so the real
 * `child_process.spawn` plumbing can be swapped for a fake in tests.
 * The spawner is responsible for turning a spec into a stream of
 * stdout/stderr chunks and throwing on non-zero exit; this runner
 * just looks up the spec for the stage and forwards.
 *
 * Stages 6-8, 10 are in-process and use their own runner wiring;
 * this runner throws if asked to run them.
 */
import type { ScaffoldConfig, StageChunk, StageNumber, StageRunner } from './scaffold-project';
import type { ShellStageSpec } from './stages';
import { shellStageSpecFor } from './stages';

export type Spawner = (spec: ShellStageSpec) => AsyncIterable<StageChunk>;

const SHELL_STAGES: ReadonlySet<StageNumber> = new Set([1, 2, 3, 4, 5, 9]);

export function createSpawnStageRunner(spawner: Spawner): StageRunner {
  return {
    run(stage: StageNumber, config: ScaffoldConfig) {
      if (!SHELL_STAGES.has(stage)) {
        throw new Error(`spawnStageRunner: stage ${stage} is not a shell-backed stage`);
      }
      return spawner(shellStageSpecFor(stage, config));
    },
  };
}
