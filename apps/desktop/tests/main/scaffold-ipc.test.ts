/**
 * `handleScaffoldStart` — the pure IPC handler that runs the
 * scaffolder: preflight → orchestrator → composite runner, streaming
 * `StageEvent`s through the supplied emit callback. Bypasses Electron
 * so the flow is testable with MemFsAdapter and a fake spawner.
 */
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { handleScaffoldStart } from '@main/ipc/scaffold';
import { deriveStages } from '@main/scaffold/scaffold-project';
import type { Spawner } from '@main/scaffold/spawn-runner';
import { beforeEach, describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj', apps: ['web'] as const };

let fs: ReturnType<typeof createMemFsAdapter>;

function passThroughSpawner(): Spawner {
  return async function* () {
    // Shell stages succeed silently; the scaffolder only cares about throws.
  };
}

function alwaysOkPreflight() {
  return async () => ({ ok: true as const });
}

beforeEach(() => {
  fs = createMemFsAdapter();
  // Seed apps/web/package.json — WORKSPACE_STITCH reads it to add the schema dep.
  // The real flow has WEB_NEXT create it; here the pass-through spawner skips that shell call.
  fs.writeFile(`${config.targetDir}/apps/web/package.json`, `${JSON.stringify({ name: 'web' })}\n`);
});

describe('handleScaffoldStart', () => {
  it('streams stage-start through stage-done for every stage on the happy path', async () => {
    const events: Array<{ kind: string; stage?: number }> = [];
    await handleScaffoldStart(config, {
      fs,
      spawner: passThroughSpawner(),
      preflight: alwaysOkPreflight(),
      emit: (ev) => {
        events.push(ev);
      },
    });
    const starts = events.filter((e) => e.kind === 'stage-start').map((e) => e.stage);
    const dones = events.filter((e) => e.kind === 'stage-done').map((e) => e.stage);
    const expected = deriveStages(config.apps as ('web' | 'mobile' | 'desktop')[]);
    expect(starts).toEqual(expected);
    expect(dones).toEqual(expected);
  });

  it('emits a preflight-failed event and stops when preflight returns errors', async () => {
    const events: Array<{ kind: string }> = [];
    await handleScaffoldStart(config, {
      fs,
      spawner: passThroughSpawner(),
      preflight: async () => ({ ok: false, error: { kind: 'missing-bun' } as const }),
      emit: (ev) => {
        events.push(ev);
      },
    });
    expect(events[0].kind).toBe('preflight-failed');
    // No stages should have run.
    expect(events.some((e) => e.kind === 'stage-start')).toBe(false);
  });

  it('emits scratch-unreadable preflight-failed when scratchPath does not exist', async () => {
    const events: Array<{ kind: string; error?: unknown }> = [];
    await handleScaffoldStart(
      { ...config, scratchPath: '/nonexistent/scratch.contexture.json' },
      {
        fs,
        spawner: passThroughSpawner(),
        preflight: alwaysOkPreflight(),
        emit: (ev) => events.push(ev),
      },
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('preflight-failed');
    expect((events[0].error as { kind: string }).kind).toBe('scratch-unreadable');
  });

  it('emits scratch-invalid-ir preflight-failed when scratchPath content is not valid IR', async () => {
    fs.writeFile('/work/bad.contexture.json', JSON.stringify({ version: '1', types: 'oops' }));
    const events: Array<{ kind: string; error?: unknown }> = [];
    await handleScaffoldStart(
      { ...config, scratchPath: '/work/bad.contexture.json' },
      {
        fs,
        spawner: passThroughSpawner(),
        preflight: alwaysOkPreflight(),
        emit: (ev) => events.push(ev),
      },
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('preflight-failed');
    expect((events[0].error as { kind: string }).kind).toBe('scratch-invalid-ir');
  });
});
