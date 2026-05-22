import { createHash } from 'node:crypto';
import {
  type EmitPipelineDeps,
  emitGeneratedTarget,
  GENERATED_TARGETS,
  isGeneratedTargetEnabled,
} from './generated-targets';
import type { Schema } from './ir';
import { bundlePathsFor } from './paths';

export type { EmitPipelineDeps } from './generated-targets';
export type { BundlePaths } from './paths';
export {
  assertContextureIrPath,
  baseNameFor,
  bundlePathsFor,
  CHANGE_LOG_FILE,
  CHAT_FILE,
  CONVEX_VALIDATORS_FILE,
  contextureDirFor,
  EMITTED_FILE,
  type GeneratedTarget,
  type GeneratedTargetKind,
  generatedTargetForPath,
  generatedTargetsFor,
  IR_SUFFIX,
  LAYOUT_FILE,
  SCHEMA_DIR,
  SCHEMA_JSON_SUFFIX,
  SCHEMA_TS_SUFFIX,
} from './paths';

export interface EmittedManifest {
  version: '1';
  files: Record<string, string>;
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface EmitPipelineResult {
  emitted: FileEntry[];
  manifest: EmittedManifest;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function buildManifest(entries: ReadonlyArray<FileEntry>): EmittedManifest {
  const files: Record<string, string> = {};
  for (const { path, content } of entries) files[path] = hashContent(content);
  return { version: '1', files };
}

export function runEmitPipeline(
  schema: Schema,
  irPath: string,
  deps: EmitPipelineDeps = {},
): EmitPipelineResult {
  const emitted = GENERATED_TARGETS.filter((target) =>
    isGeneratedTargetEnabled(schema, target.kind),
  ).map((target) => ({
    path: target.path(bundlePathsFor(irPath)),
    content: emitGeneratedTarget(schema, target.kind, irPath, deps),
  }));

  return { emitted, manifest: buildManifest(emitted) };
}
