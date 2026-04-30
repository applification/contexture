import { createHash } from 'node:crypto';
import { emitConvexSchema } from './emit-convex';
import { emit as emitJsonSchema } from './emit-json-schema';
import { emit as emitSchemaIndex } from './emit-schema-index';
import { emit as emitZod } from './emit-zod';
import type { Schema } from './ir';
import { type BundlePaths, baseNameFor, bundlePathsFor } from './paths';

export type { BundlePaths } from './paths';
export {
  baseNameFor,
  bundlePathsFor,
  CHAT_FILE,
  contextureDirFor,
  EMITTED_FILE,
  IR_SUFFIX,
  LAYOUT_FILE,
  projectRootFor,
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

export interface EmitPipelineDeps {
  emitZod?: (schema: Schema, sourcePath: string) => string;
  emitJsonSchema?: (schema: Schema, sourcePath?: string) => unknown;
  emitSchemaIndex?: (baseName: string, sourcePath?: string) => string;
  emitConvex?: (schema: Schema, sourcePath?: string) => string;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function buildManifest(entries: ReadonlyArray<FileEntry>): EmittedManifest {
  const files: Record<string, string> = {};
  for (const { path, content } of entries) files[path] = sha256(content);
  return { version: '1', files };
}

export function runEmitPipeline(
  schema: Schema,
  irPath: string,
  deps: EmitPipelineDeps = {},
): EmitPipelineResult {
  const paths: BundlePaths = bundlePathsFor(irPath);
  const {
    emitZod: emitZodImpl = emitZod,
    emitJsonSchema: emitJsonSchemaImpl = (s: Schema, sp?: string) =>
      emitJsonSchema(s, undefined, sp),
    emitSchemaIndex: emitSchemaIndexImpl = emitSchemaIndex,
    emitConvex: emitConvexImpl = emitConvexSchema,
  } = deps;
  const schemaTs = emitZodImpl(schema, irPath);
  const schemaJson = `${JSON.stringify(emitJsonSchemaImpl(schema, irPath), null, 2)}\n`;
  const schemaIndex = emitSchemaIndexImpl(baseNameFor(irPath), irPath);
  const convexSource = emitConvexImpl(schema, irPath);

  const emitted: FileEntry[] = [
    { path: paths.schemaTs, content: schemaTs },
    { path: paths.schemaJson, content: schemaJson },
    { path: paths.schemaIndex, content: schemaIndex },
    { path: paths.convex, content: convexSource },
  ];

  return { emitted, manifest: buildManifest(emitted) };
}
