/**
 * Stage command table — pure derivation of what shell command each
 * external-tool stage runs, against what cwd. Keeping this separate
 * from the spawn/IO layer lets tests assert "stage 3 calls
 * create-next-app with these exact flags" without shelling out.
 *
 * Only shell-backed stages (1-5, 9) have a spec; stages 6-8 and 10
 * are in-process work (emitters; git init runs through its own spec
 * trio from `git-init.ts`).
 */
import type { ScaffoldConfig, StageNumber } from './scaffold-project';

export interface ShellStageSpec {
  cmd: string;
  args: string[];
  cwd: string;
}

function parentDirOf(path: string): string {
  const slash = path.lastIndexOf('/');
  if (slash <= 0) return '/';
  return path.slice(0, slash);
}

export function shellStageSpecFor(stage: StageNumber, config: ScaffoldConfig): ShellStageSpec {
  const parent = parentDirOf(config.targetDir);
  const target = config.targetDir;
  const webDir = `${target}/apps/web`;
  const schemaDir = `${target}/packages/schema`;
  switch (stage) {
    case 1:
      return {
        cmd: 'bunx',
        args: [
          'create-turbo@latest',
          config.projectName,
          '--package-manager',
          'bun',
          '--skip-install',
        ],
        cwd: parent,
      };
    case 2:
      return { cmd: 'rm', args: ['-rf', 'apps/web'], cwd: target };
    case 3:
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
    case 4:
      return { cmd: 'bunx', args: ['shadcn@latest', 'init', '--yes'], cwd: webDir };
    case 5:
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
    case 9:
      return { cmd: 'bun', args: ['install'], cwd: target };
    default:
      throw new Error(`shellStageSpecFor: stage ${stage} is not a shell-backed stage`);
  }
}
