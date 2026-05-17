/**
 * `scaffoldConvexEmit` (stage 7) — reads the IR that stage 6 just
 * wrote and emits the Convex schema at
 * `packages/contexture/convex/schema.ts`. The stage now reuses the shared
 * generated-bundle writer so the emitted manifest remains complete after
 * scaffolding instead of being narrowed to only the Convex schema.
 *
 * Per-table CRUD seeds aren't written here: the initial IR has no
 * `table: true` objects. Stage 10 (optional LLM seed) may populate
 * tables; the subsequent save then seeds CRUD via the DocumentStore's
 * open-time seed loop.
 */
import { IRSchema, writeGeneratedBundle } from '@contexture/core';
import type { FsAdapter } from '@main/documents/document-store';

import type { ScaffoldConfig } from './scaffold-project';

export interface ConvexEmitDeps {
  fs: FsAdapter;
}

export async function scaffoldConvexEmit(
  config: ScaffoldConfig,
  deps: ConvexEmitDeps,
): Promise<void> {
  const { fs } = deps;
  const schemaDir = `${config.targetDir}/packages/contexture`;
  const irPath = `${schemaDir}/${config.projectName}.contexture.json`;

  const ir = IRSchema.parse(JSON.parse(await fs.readFile(irPath)));
  await writeGeneratedBundle({
    irPath,
    schema: ir,
    fs,
    includeIr: false,
    driftPreflight: false,
  });
}
