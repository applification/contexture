/**
 * `scaffoldConvexEmit` (stage 7) — reads the IR that stage 6 just
 * wrote and emits the Convex schema at
 * `packages/schema/convex/schema.ts`. At scaffold time the IR is
 * empty, so the emitted file is a degenerate `defineSchema({})` — but
 * Convex requires the file to exist before `bun run dev` can start,
 * so this stage always runs.
 *
 * Per-table CRUD seeds aren't written here: the initial IR has no
 * `table: true` objects. Stage 10 (optional LLM seed) may populate
 * tables; the subsequent save then seeds CRUD via the DocumentStore's
 * open-time seed loop.
 */
import { createHash } from 'node:crypto';
import type { FsAdapter } from '@main/documents/document-store';
import { emitConvexSchema } from '@renderer/model/emit-convex';
import type { Schema } from '@renderer/model/ir';

import type { ScaffoldConfig } from './scaffold-project';

export interface ConvexEmitDeps {
  fs: FsAdapter;
}

export async function scaffoldConvexEmit(
  config: ScaffoldConfig,
  deps: ConvexEmitDeps,
): Promise<void> {
  const { fs } = deps;
  const schemaDir = `${config.targetDir}/packages/schema`;
  const irPath = `${schemaDir}/${config.projectName}.contexture.json`;
  const convexPath = `${schemaDir}/convex/schema.ts`;
  const emittedPath = `${schemaDir}/.contexture/emitted.json`;

  const ir = JSON.parse(await fs.readFile(irPath)) as Schema;
  const convexSource = emitConvexSchema(ir);
  await fs.writeFile(convexPath, convexSource);

  // Seed emitted.json with the hash of the file we just wrote so the
  // drift watcher has a baseline to compare against on first open.
  const hash = createHash('sha256').update(convexSource, 'utf8').digest('hex');
  const manifest = { version: '1', files: { [convexPath]: hash } };
  await fs.writeFile(emittedPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
