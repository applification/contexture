/**
 * `gitInitStageSpec` (stage 8, git half) — runs `git init` plus
 * an initial commit at the project root. The command is held as a
 * spec (same shape as the shell stages 1-5) so the orchestrator can
 * run it through the injected Spawner without special-casing git.
 */
import { gitInitStageSpec } from '@main/scaffold/git-init';
import { describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj' };

describe('gitInitStageSpec', () => {
  it('runs `git init` then `git add -A` then `git commit` at the project root', () => {
    const specs = gitInitStageSpec(config);
    expect(specs.map((s) => [s.cmd, s.args[0]])).toEqual([
      ['git', 'init'],
      ['git', 'add'],
      ['git', 'commit'],
    ]);
    for (const s of specs) {
      expect(s.cwd).toBe(config.targetDir);
    }
  });

  it('uses a descriptive initial commit message', () => {
    const specs = gitInitStageSpec(config);
    const commit = specs[2];
    const messageIdx = commit.args.indexOf('-m');
    expect(messageIdx).toBeGreaterThanOrEqual(0);
    expect(commit.args[messageIdx + 1]).toMatch(/initial|scaffold/i);
  });
});
