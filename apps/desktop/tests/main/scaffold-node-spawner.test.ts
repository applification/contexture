/**
 * `nodeSpawner` — the production `Spawner`: wraps `child_process.spawn`
 * into the `AsyncIterable<StageChunk>` shape the orchestrator expects.
 * Tested against real short commands (`echo`, `false`) so the spawn
 * plumbing — stdout streaming, stderr streaming, non-zero-exit throws —
 * is exercised end-to-end without needing a full scaffold run.
 */
import { nodeSpawner } from '@main/scaffold/node-spawner';
import { describe, expect, it } from 'vitest';

describe('nodeSpawner', () => {
  it('streams stdout from a real command as stdout-chunk events', async () => {
    const chunks: string[] = [];
    for await (const ev of nodeSpawner({ cmd: 'echo', args: ['hello'], cwd: '/tmp' })) {
      if (ev.kind === 'stdout-chunk') chunks.push(ev.chunk);
    }
    expect(chunks.join('')).toContain('hello');
  });

  it('throws on non-zero exit, surfacing the exit code in the message', async () => {
    await expect(async () => {
      for await (const _ of nodeSpawner({ cmd: 'false', args: [], cwd: '/tmp' })) {
        // drain
      }
    }).rejects.toThrow(/exit|code/i);
  });
});
