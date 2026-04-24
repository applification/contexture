/**
 * `gitInitStageSpec` — the trio of `git init` / `git add -A` /
 * `git commit` commands that run after the scaffold's file work is
 * done. Held as a spec list (same shape as `ShellStageSpec`) so the
 * orchestrator runs them through the injected Spawner like any other
 * shell stage — no special-case git plumbing in the main path.
 */
import type { ScaffoldConfig } from './scaffold-project';
import type { ShellStageSpec } from './stages';

export function gitInitStageSpec(config: ScaffoldConfig): ShellStageSpec[] {
  return [
    { cmd: 'git', args: ['init'], cwd: config.targetDir },
    { cmd: 'git', args: ['add', '-A'], cwd: config.targetDir },
    {
      cmd: 'git',
      args: ['commit', '-m', 'initial scaffold by Contexture'],
      cwd: config.targetDir,
    },
  ];
}
