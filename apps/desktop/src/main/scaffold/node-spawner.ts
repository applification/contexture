/**
 * `nodeSpawner` — the production `Spawner` for the scaffold runner.
 * Wraps `child_process.spawn` so stdout / stderr chunks arrive as
 * `StageChunk` events and a non-zero exit throws. Kept minimal: no
 * buffering, no timeout, no kill-on-cancel — the orchestrator owns
 * lifecycle via the async-iteration protocol.
 */
import { spawn } from 'node:child_process';

import type { StageChunk } from './scaffold-project';
import type { ShellStageSpec } from './stages';

export async function* nodeSpawner(spec: ShellStageSpec): AsyncIterable<StageChunk> {
  const child = spawn(spec.cmd, spec.args, { cwd: spec.cwd, stdio: ['ignore', 'pipe', 'pipe'] });

  const queue: Array<StageChunk | { kind: 'exit'; code: number | null }> = [];
  let notify: (() => void) | null = null;
  const push = (item: (typeof queue)[number]) => {
    queue.push(item);
    notify?.();
  };

  child.stdout.on('data', (buf: Buffer) => push({ kind: 'stdout-chunk', chunk: buf.toString() }));
  child.stderr.on('data', (buf: Buffer) => push({ kind: 'stderr-chunk', chunk: buf.toString() }));
  child.on('error', (err) => push({ kind: 'stderr-chunk', chunk: String(err) }));
  child.on('close', (code) => push({ kind: 'exit', code }));

  while (true) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
      notify = null;
      continue;
    }
    const item = queue.shift();
    if (!item) continue;
    if (item.kind === 'exit') {
      if (item.code !== 0) throw new Error(`${spec.cmd} exited with code ${item.code}`);
      return;
    }
    yield item;
  }
}
