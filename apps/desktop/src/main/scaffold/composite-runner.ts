/**
 * `createCompositeStageRunner` — the production `StageRunner`: one
 * object that knows how to run every stage. Shell-backed stages
 * (2-5, 10) go through the injected `Spawner`; in-process stages
 * (1 skeleton, 6 Convex init, 7 schema package, 8 Convex emit,
 * 9 workspace stitch + git trio, 11 LLM seed no-op) run directly.
 */
import type { FsAdapter } from '@main/documents/document-store';
import { scaffoldConvexEmit } from './convex-emit';
import { gitInitStageSpec } from './git-init';
import type { ScaffoldConfig, StageChunk, StageNumber, StageRunner } from './scaffold-project';
import { STAGE } from './scaffold-project';
import { scaffoldSchemaPackage } from './schema-package';
import type { Spawner } from './spawn-runner';
import { shellStageSpecFor } from './stages';
import { scaffoldTurboSkeleton } from './turbo-skeleton';
import { scaffoldWorkspaceStitch } from './workspace-stitch';

export interface CompositeRunnerDeps {
  fs: FsAdapter;
  spawner: Spawner;
}

const PURE_SHELL_STAGES: ReadonlySet<StageNumber> = new Set([
  STAGE.WEB_NEXT,
  STAGE.WEB_SHADCN,
  STAGE.MOBILE_EXPO,
  STAGE.DESKTOP_ELECTRON,
  STAGE.BUN_INSTALL,
]);

export function createCompositeStageRunner(deps: CompositeRunnerDeps): StageRunner {
  const { fs, spawner } = deps;
  return {
    run(stage: StageNumber, config: ScaffoldConfig): AsyncIterable<StageChunk> {
      if (PURE_SHELL_STAGES.has(stage)) {
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
      case STAGE.TURBO_SKELETON:
        await scaffoldTurboSkeleton(config, { fs });
        return;
      case STAGE.CONVEX_INIT: {
        // Convex CLI needs (a) a package.json in cwd, (b) `convex` listed as
        // a dep to reach the push step, and (c) `convex/server` resolvable
        // on disk or its config bundler fails. So we write a bare anchor,
        // install only convex locally, then run `convex dev --once`. Stage 7
        // rewrites this file with the real schema-package shape later.
        const schemaDir = `${config.targetDir}/packages/schema`;
        await fs.writeFile(
          `${schemaDir}/package.json`,
          `${JSON.stringify(
            {
              name: `@${config.projectName}/schema`,
              private: true,
              dependencies: { convex: 'latest' },
            },
            null,
            2,
          )}\n`,
        );
        for await (const chunk of spawner({
          cmd: 'bun',
          args: ['install'],
          cwd: schemaDir,
        })) {
          yield chunk;
        }
        for await (const chunk of spawner(shellStageSpecFor(STAGE.CONVEX_INIT, config)))
          yield chunk;
        return;
      }
      case STAGE.SCHEMA_PACKAGE:
        await scaffoldSchemaPackage(config, { fs });
        return;
      case STAGE.CONVEX_EMIT:
        await scaffoldConvexEmit(config, { fs });
        return;
      case STAGE.WORKSPACE_STITCH: {
        await scaffoldWorkspaceStitch(config, { fs });
        for (const spec of gitInitStageSpec(config)) {
          for await (const chunk of spawner(spec)) yield chunk;
        }
        return;
      }
      case STAGE.LLM_SEED:
        return;
      default:
        throw new Error(`composite runner: unexpected in-process stage ${stage}`);
    }
  }
}
