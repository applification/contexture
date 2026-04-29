import { createHash } from 'node:crypto';
import { emitConvexSchema } from './emit-convex';
import { emit as emitJsonSchema } from './emit-json-schema';
import { emit as emitSchemaIndex } from './emit-schema-index';
import { emit as emitZod } from './emit-zod';
import type { Schema } from './ir';

export const IR_SUFFIX = '.contexture.json';
export const SCHEMA_TS_SUFFIX = '.schema.ts';
export const SCHEMA_JSON_SUFFIX = '.schema.json';
export const LAYOUT_FILE = 'layout.json';
export const CHAT_FILE = 'chat.json';
export const EMITTED_FILE = 'emitted.json';

export interface EmittedManifest {
  version: '1';
  files: Record<string, string>;
}

export interface BundlePaths {
  ir: string;
  layout: string;
  chat: string;
  emitted: string;
  schemaTs: string;
  schemaJson: string;
  schemaIndex: string;
  convex: string;
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

export function contextureDirFor(irPath: string): string {
  const slash = irPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : irPath.slice(0, slash);
  return `${dir}/.contexture`;
}

export function baseNameFor(irPath: string): string {
  const slash = irPath.lastIndexOf('/');
  const leaf = slash === -1 ? irPath : irPath.slice(slash + 1);
  return leaf.slice(0, -IR_SUFFIX.length);
}

export function projectRootFor(irPath: string): string | null {
  const suffix = '/packages/contexture/';
  const slash = irPath.lastIndexOf('/');
  if (slash === -1) return null;
  const dir = irPath.slice(0, slash);
  if (!dir.endsWith('/packages/contexture')) return null;
  return dir.slice(0, -suffix.length + 1);
}

export function bundlePathsFor(irPath: string): BundlePaths {
  if (!irPath.endsWith(IR_SUFFIX)) {
    throw new Error(`Expected a ${IR_SUFFIX} path, got: ${irPath}`);
  }
  const base = irPath.slice(0, -IR_SUFFIX.length);
  const ctxDir = contextureDirFor(irPath);
  const dir = ctxDir.slice(0, -'/.contexture'.length);
  return {
    ir: irPath,
    layout: `${ctxDir}/${LAYOUT_FILE}`,
    chat: `${ctxDir}/${CHAT_FILE}`,
    emitted: `${ctxDir}/${EMITTED_FILE}`,
    schemaTs: `${base}${SCHEMA_TS_SUFFIX}`,
    schemaJson: `${base}${SCHEMA_JSON_SUFFIX}`,
    schemaIndex: `${dir}/index.ts`,
    convex: `${dir}/convex/schema.ts`,
  };
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
  const paths = bundlePathsFor(irPath);
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
