/**
 * `handleScaffoldStart` — the pure IPC handler that runs the
 * scaffolder: preflight → orchestrator → composite runner, streaming
 * `StageEvent`s through the supplied emit callback. Bypasses Electron
 * so the flow is testable with MemFsAdapter and a fake spawner.
 */
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { handleScaffoldStart } from '@main/ipc/scaffold';
import type { Spawner } from '@main/scaffold/spawn-runner';
import { beforeEach, describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj' };

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
  // Seed the files that shell stages 1-5 would have laid down — the
  // in-process stages reach for `apps/web/package.json` and the IR.
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
    expect(starts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(dones).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
});
