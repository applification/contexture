/**
 * `createCompositeStageRunner` — the production `StageRunner`: one
 * object that knows how to run every stage 1-10. Shell-backed stages
 * (1-5, 9) go through the injected `Spawner`; in-process stages
 * (6 schema package, 7 Convex emit, 8 workspace stitch + git trio)
 * run directly against the injected `FsAdapter`. Stage 10 is a
 * no-op in v1 (LLM seeding lives in a separate issue).
 *
 * Splitting dispatch from implementation keeps the orchestrator
 * ignorant of how any given stage does its work — it just drains
 * the chunk stream and watches for throws.
 */
import type { FsAdapter } from '@main/documents/document-store';
import { scaffoldConvexEmit } from './convex-emit';
import { gitInitStageSpec } from './git-init';
import type { ScaffoldConfig, StageChunk, StageNumber, StageRunner } from './scaffold-project';
import { scaffoldSchemaPackage } from './schema-package';
import type { Spawner } from './spawn-runner';
import { shellStageSpecFor } from './stages';
import { scaffoldWorkspaceStitch } from './workspace-stitch';

export interface CompositeRunnerDeps {
  fs: FsAdapter;
  spawner: Spawner;
}

const SHELL_STAGES: ReadonlySet<StageNumber> = new Set([1, 2, 3, 4, 5, 9]);

export function createCompositeStageRunner(deps: CompositeRunnerDeps): StageRunner {
  const { fs, spawner } = deps;
  return {
    run(stage: StageNumber, config: ScaffoldConfig): AsyncIterable<StageChunk> {
      if (SHELL_STAGES.has(stage)) {
        return spawner(shellStageSpecFor(stage, config));
      }
      return runInProcess(stage, config);
    },
  };

  async function* runInProcess(
    stage: StageNumber,
    config: ScaffoldConfig,
  ): AsyncIterable<StageChunk> {
    switch (stage) {
      case 6:
        await scaffoldSchemaPackage(config, { fs });
        return;
      case 7:
        await scaffoldConvexEmit(config, { fs });
        return;
      case 8: {
        await scaffoldWorkspaceStitch(config, { fs });
        for (const spec of gitInitStageSpec(config)) {
          for await (const chunk of spawner(spec)) yield chunk;
        }
        return;
      }
      case 10:
        return;
      default:
        throw new Error(`composite runner: unexpected in-process stage ${stage}`);
    }
  }
}
