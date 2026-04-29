/**
 * Stage command table — pure derivation of what shell command each
 * external-tool stage runs, against what cwd. Only shell-backed stages
 * have a spec; the TurboRepo skeleton (stage 1), Convex init (stage 6),
 * schema/emit stages (7-9), and LLM seed (11) are in-process.
 */

import type { ScaffoldConfig } from './scaffold-project';
import { STAGE } from './scaffold-project';

export interface ShellStageSpec {
  cmd: string;
  args: string[];
  cwd: string;
}

export function shellStageSpecFor(stage: number, config: ScaffoldConfig): ShellStageSpec {
  const target = config.targetDir;
  const webDir = `${target}/apps/web`;
  const schemaDir = `${target}/packages/contexture`;
  switch (stage) {
    case STAGE.WEB_NEXT:
      return {
        cmd: 'bunx',
        args: [
          'create-next-app@latest',
          'apps/web',
          '--ts',
          '--app',
          '--tailwind',
          '--eslint',
          '--use-bun',
          '--yes',
        ],
        cwd: target,
      };
    case STAGE.WEB_SHADCN:
      return { cmd: 'bunx', args: ['shadcn@latest', 'init', '--yes'], cwd: webDir };
    case STAGE.MOBILE_EXPO:
      return {
        cmd: 'bunx',
        args: [
          'create-expo-app@latest',
          'apps/mobile',
          '--template=default',
          '--yes',
          '--no-install',
        ],
        cwd: target,
      };
    case STAGE.DESKTOP_ELECTRON:
      return {
        cmd: 'bunx',
        args: ['create-electron-app@latest', 'apps/desktop', '--template=vite-typescript'],
        cwd: target,
      };
    case STAGE.CONVEX_INIT:
      return {
        cmd: 'bunx',
        args: [
          'convex@latest',
          'dev',
          '--once',
          '--configure=new',
          '--local',
          '--project',
          config.projectName,
        ],
        cwd: schemaDir,
      };
    case STAGE.BUN_INSTALL:
      return { cmd: 'bun', args: ['install'], cwd: target };
    default:
      throw new Error(`shellStageSpecFor: stage ${stage} is not a shell-backed stage`);
  }
}
