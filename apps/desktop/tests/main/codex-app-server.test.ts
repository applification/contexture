import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { type SpawnCodexAppServerFn, startCodexAppServer } from '@main/providers/codex/app-server';
import { describe, expect, it, vi } from 'vitest';

function fakeChild() {
  const child = new EventEmitter() as ReturnType<SpawnCodexAppServerFn>;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

describe('startCodexAppServer', () => {
  it('spawns codex app-server over stdio', () => {
    const child = fakeChild();
    const spawnFn = vi.fn<SpawnCodexAppServerFn>(() => child);

    const connection = startCodexAppServer({
      codexPath: '/opt/bin/codex',
      spawnFn,
      env: { PATH: '/opt/bin' },
    });

    expect(spawnFn).toHaveBeenCalledWith('/opt/bin/codex', ['app-server', '--listen', 'stdio://'], {
      stdio: 'pipe',
      env: { PATH: '/opt/bin' },
    });

    connection.dispose();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('disposes the JSON-RPC client when the process exits', async () => {
    const child = fakeChild();
    const onExit = vi.fn();
    const connection = startCodexAppServer({
      spawnFn: vi.fn<SpawnCodexAppServerFn>(() => child),
      onExit,
    });
    const pending = connection.client.request('initialize', {});

    child.emit('exit', 1, null);

    await expect(pending).rejects.toThrow('Codex app-server connection closed');
    expect(onExit).toHaveBeenCalledWith(1, null);
  });
});
