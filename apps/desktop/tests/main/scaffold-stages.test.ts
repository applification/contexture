/**
 * Per-stage command/cwd/args derivation — asserts what commands the
 * scaffolder would run for a given config. Only shell-backed stages
 * have a spec; the in-process stages (TURBO_SKELETON, CONVEX_INIT,
 * SCHEMA_PACKAGE, CONVEX_EMIT, WORKSPACE_STITCH, LLM_SEED) are not
 * covered here.
 */
import { STAGE } from '@main/scaffold/scaffold-project';
import { shellStageSpecFor } from '@main/scaffold/stages';
import { describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj', apps: ['web'] as const };
const webDir = '/work/my-proj/apps/web';

describe('shellStageSpecFor', () => {
  it('WEB_NEXT: bunx create-next-app with non-interactive flags', () => {
    const spec = shellStageSpecFor(STAGE.WEB_NEXT, config);
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

  it('WEB_SHADCN: bunx shadcn init inside apps/web', () => {
    const spec = shellStageSpecFor(STAGE.WEB_SHADCN, config);
    expect(spec).toEqual({
      cmd: 'bunx',
      args: ['shadcn@latest', 'init', '--yes'],
      cwd: webDir,
    });
  });

  it('MOBILE_EXPO: bunx create-expo-app with default template, no-install', () => {
    const spec = shellStageSpecFor(STAGE.MOBILE_EXPO, config);
    expect(spec.cmd).toBe('bunx');
    expect(spec.args[0]).toBe('create-expo-app@latest');
    expect(spec.args).toContain('apps/mobile');
    expect(spec.args).toContain('--no-install');
    expect(spec.cwd).toBe('/work/my-proj');
  });

  it('DESKTOP_ELECTRON: bunx create-electron-app with vite-typescript template', () => {
    const spec = shellStageSpecFor(STAGE.DESKTOP_ELECTRON, config);
    expect(spec.cmd).toBe('bunx');
    expect(spec.args[0]).toBe('create-electron-app@latest');
    expect(spec.args).toContain('apps/desktop');
    expect(spec.args).toContain('--template=vite-typescript');
    expect(spec.cwd).toBe('/work/my-proj');
  });

  it('CONVEX_INIT: convex dev one-shot configure, local backend, inside packages/schema', () => {
    const spec = shellStageSpecFor(STAGE.CONVEX_INIT, config);
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

  it('BUN_INSTALL: bun install at the project root', () => {
    const spec = shellStageSpecFor(STAGE.BUN_INSTALL, config);
    expect(spec).toEqual({
      cmd: 'bun',
      args: ['install'],
      cwd: '/work/my-proj',
    });
  });

  it('throws for unknown stage numbers', () => {
    expect(() => shellStageSpecFor(999, config)).toThrow();
  });
});
