/**
 * End-to-end scaffold test — gated behind `SCAFFOLD_E2E=1` because it
 * takes minutes (create-turbo, create-next-app, shadcn init, bunx
 * convex --once, bun install) and hits the real network. Treat it as
 * the "does the whole thing actually work on this machine" smoke.
 *
 * Normal CI / TDD loops skip it. Run locally with:
 *   SCAFFOLD_E2E=1 bunx vitest run tests/main/scaffold-e2e.test.ts
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { nodeFsAdapter } from '@main/documents/node-fs-adapter';
import { handleScaffoldStart, type ScaffoldEvent } from '@main/ipc/scaffold';
import { nodePreflightDeps } from '@main/scaffold/node-preflight-deps';
import { nodeSpawner } from '@main/scaffold/node-spawner';
import { runPreflight } from '@main/scaffold/preflight';
import { describe, expect, it } from 'vitest';

const E2E = process.env.SCAFFOLD_E2E === '1';
const describeOrSkip = E2E ? describe : describe.skip;

describeOrSkip('scaffold end-to-end (SCAFFOLD_E2E=1)', () => {
  it(
    'scaffolds a complete project and leaves it buildable',
    async () => {
      const parent = mkdtempSync(join(tmpdir(), 'contexture-e2e-'));
      const projectName = 'e2e-proj';
      const targetDir = join(parent, projectName);
      const events: ScaffoldEvent[] = [];
      try {
        await handleScaffoldStart(
          { targetDir, projectName },
          {
            fs: nodeFsAdapter,
            spawner: nodeSpawner,
            preflight: (c) => runPreflight({ targetDir: c.targetDir }, nodePreflightDeps),
            emit: (ev) => events.push(ev),
          },
        );

        // No preflight failure, no stage failure. On failure, surface which
        // stage tripped and the captured stderr — this is a 15-minute test,
        // so "expected true to be false" alone is useless.
        expect(events.some((e) => e.kind === 'preflight-failed')).toBe(false);
        const failed = events.find((e) => e.kind === 'stage-failed');
        if (failed) {
          throw new Error(
            `stage ${failed.stage} failed (retrySafe=${failed.retrySafe}):\n${failed.stderr}`,
          );
        }

        // Every stage reached stage-done.
        const dones = events.filter((e) => e.kind === 'stage-done').map((e) => e.stage);
        expect(dones).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

        // Key artefacts on disk.
        expect(existsSync(join(targetDir, 'apps/web/package.json'))).toBe(true);
        expect(
          existsSync(join(targetDir, 'packages/schema', `${projectName}.contexture.json`)),
        ).toBe(true);
        expect(existsSync(join(targetDir, 'packages/schema/convex/schema.ts'))).toBe(true);
        expect(existsSync(join(targetDir, 'CLAUDE.md'))).toBe(true);
        expect(existsSync(join(targetDir, 'biome.json'))).toBe(true);
        expect(existsSync(join(targetDir, '.git'))).toBe(true);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    },
    15 * 60 * 1000,
  );
});
