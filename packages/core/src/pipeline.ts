import { createHash } from 'node:crypto';
import { emitAiToolSchemas } from './emit-ai-tool-schemas';
import { emitConvexSchema } from './emit-convex';
import { emitFormValidators } from './emit-form-validators';
import { emit as emitJsonSchema } from './emit-json-schema';
import { emitMcpDefinitions } from './emit-mcp-definitions';
import { emit as emitSchemaIndex } from './emit-schema-index';
import { emitStructuredOutputSchemas } from './emit-structured-output-schemas';
import { emit as emitZod } from './emit-zod';
import type { Schema } from './ir';
import { type BundlePaths, baseNameFor, bundlePathsFor } from './paths';

export type { BundlePaths } from './paths';
export {
  assertContextureIrPath,
  assertWritableContextureProjectIrPath,
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
  emitAiToolSchemas?: (schema: Schema, sourcePath?: string) => unknown;
  emitStructuredOutputSchemas?: (schema: Schema, sourcePath?: string) => unknown;
  emitMcpDefinitions?: (schema: Schema, sourcePath?: string) => unknown;
  emitFormValidators?: (schema: Schema, baseName: string, sourcePath?: string) => string;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function outputEnabled(schema: Schema, target: 'zod' | 'jsonSchema' | 'schemaIndex' | 'convex') {
  return schema.outputs?.[target]?.enabled !== false;
}

function aiOutputEnabled(schema: Schema, target: 'toolSchemas') {
  return schema.outputs?.aiPipeline?.[target]?.enabled === true;
}

function structuredOutputEnabled(schema: Schema) {
  return schema.outputs?.aiPipeline?.structuredOutputs?.enabled === true;
}

function mcpDefinitionsEnabled(schema: Schema) {
  return schema.outputs?.aiPipeline?.mcpDefinitions?.enabled === true;
}

function formValidatorsEnabled(schema: Schema) {
  return schema.outputs?.aiPipeline?.formValidators?.enabled === true;
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
  const paths: BundlePaths = bundlePathsFor(irPath);
  const {
    emitZod: emitZodImpl = emitZod,
    emitJsonSchema: emitJsonSchemaImpl = (s: Schema, sp?: string) =>
      emitJsonSchema(s, undefined, sp),
    emitSchemaIndex: emitSchemaIndexImpl = emitSchemaIndex,
    emitConvex: emitConvexImpl = emitConvexSchema,
    emitAiToolSchemas: emitAiToolSchemasImpl = emitAiToolSchemas,
    emitStructuredOutputSchemas: emitStructuredOutputSchemasImpl = emitStructuredOutputSchemas,
    emitMcpDefinitions: emitMcpDefinitionsImpl = emitMcpDefinitions,
    emitFormValidators: emitFormValidatorsImpl = emitFormValidators,
  } = deps;

  const emitted: FileEntry[] = [];

  if (outputEnabled(schema, 'zod')) {
    emitted.push({ path: paths.schemaTs, content: emitZodImpl(schema, irPath) });
  }
  if (outputEnabled(schema, 'jsonSchema')) {
    emitted.push({
      path: paths.schemaJson,
      content: `${JSON.stringify(emitJsonSchemaImpl(schema, irPath), null, 2)}\n`,
    });
  }
  if (outputEnabled(schema, 'schemaIndex')) {
    emitted.push({
      path: paths.schemaIndex,
      content: emitSchemaIndexImpl(baseNameFor(irPath), irPath),
    });
  }
  if (outputEnabled(schema, 'convex')) {
    emitted.push({ path: paths.convex, content: emitConvexImpl(schema, irPath) });
  }
  if (aiOutputEnabled(schema, 'toolSchemas')) {
    emitted.push({
      path: paths.aiToolSchemas,
      content: `${JSON.stringify(emitAiToolSchemasImpl(schema, irPath), null, 2)}\n`,
    });
  }
  if (structuredOutputEnabled(schema)) {
    emitted.push({
      path: paths.structuredOutputSchemas,
      content: `${JSON.stringify(emitStructuredOutputSchemasImpl(schema, irPath), null, 2)}\n`,
    });
  }
  if (mcpDefinitionsEnabled(schema)) {
    emitted.push({
      path: paths.mcpDefinitions,
      content: `${JSON.stringify(emitMcpDefinitionsImpl(schema, irPath), null, 2)}\n`,
    });
  }
  if (formValidatorsEnabled(schema)) {
    emitted.push({
      path: paths.formValidators,
      content: emitFormValidatorsImpl(schema, baseNameFor(irPath), irPath),
    });
  }

  return { emitted, manifest: buildManifest(emitted) };
}
