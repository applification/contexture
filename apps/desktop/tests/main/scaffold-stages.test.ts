/**
 * Per-stage command/cwd/args derivation — separated from spawn/IO so
 * we can assert exactly what commands the scaffolder would run for a
 * given config. Stages 1-4 are fully external (Turbo, Next, shadcn);
 * they share the same spawn shape so only this pure-data derivation
 * is worth asserting here.
 */
import { shellStageSpecFor } from '@main/scaffold/stages';
import { describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj' };
const parent = '/work';
const nextCwd = '/work/my-proj/apps/web';

describe('shellStageSpecFor', () => {
  it('stage 1: bunx create-turbo in the parent dir, skip-install, bun package manager', () => {
    const spec = shellStageSpecFor(1, config);
    expect(spec).toEqual({
      cmd: 'bunx',
      args: ['create-turbo@latest', 'my-proj', '--package-manager', 'bun', '--skip-install'],
      cwd: parent,
    });
  });

  it('stage 2: removes apps/web that create-turbo just laid down', () => {
    const spec = shellStageSpecFor(2, config);
    expect(spec.cmd).toBe('rm');
    expect(spec.args).toEqual(['-rf', 'apps/web']);
    expect(spec.cwd).toBe('/work/my-proj');
  });

  it('stage 3: bunx create-next-app at apps/web with the non-interactive flag set', () => {
    const spec = shellStageSpecFor(3, config);
    expect(spec.cmd).toBe('bunx');
    expect(spec.args).toEqual([
      'create-next-app@latest',
      'apps/web',
      '--ts',
      '--app',
      '--tailwind',
      '--eslint',
      '--use-bun',
      '--yes',
    ]);
    expect(spec.cwd).toBe('/work/my-proj');
  });

  it('stage 4: bunx shadcn init inside apps/web', () => {
    const spec = shellStageSpecFor(4, config);
    expect(spec).toEqual({
      cmd: 'bunx',
      args: ['shadcn@latest', 'init', '--yes'],
      cwd: nextCwd,
    });
  });

  it('stage 5: convex dev one-shot configure, local backend, inside packages/schema', () => {
    const spec = shellStageSpecFor(5, config);
    expect(spec.cmd).toBe('bunx');
    expect(spec.args).toEqual([
      'convex@latest',
      'dev',
      '--once',
      '--configure=new',
      '--local',
      '--project',
      'my-proj',
    ]);
    expect(spec.cwd).toBe('/work/my-proj/packages/schema');
  });

  it('stage 9: bun install at the project root to resolve the new workspace dep', () => {
    const spec = shellStageSpecFor(9, config);
    expect(spec).toEqual({
      cmd: 'bun',
      args: ['install'],
      cwd: '/work/my-proj',
    });
  });
});
