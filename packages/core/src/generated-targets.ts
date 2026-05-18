import { emitAiToolSchemas } from './emit-ai-tool-schemas';
import { emitConvexSchema } from './emit-convex';
import { emitFormValidators } from './emit-form-validators';
import { emit as emitJsonSchema } from './emit-json-schema';
import { emitMcpDefinitions } from './emit-mcp-definitions';
import { emit as emitSchemaIndex } from './emit-schema-index';
import { emitStructuredOutputSchemas } from './emit-structured-output-schemas';
import { emit as emitZod } from './emit-zod';
import type { Schema } from './ir';
import { type BundlePaths, baseNameFor, bundlePathsFor, type GeneratedTargetKind } from './paths';

export type GeneratedTargetGroup = 'core' | 'ai' | 'forms';
export type GeneratedTargetLanguage = 'typescript' | 'json';

export interface GeneratedTargetMetadata {
  kind: GeneratedTargetKind;
  group: GeneratedTargetGroup;
  label: string;
  help: string;
  language: GeneratedTargetLanguage;
  previewable: boolean;
  displayPath: (baseName: string) => string;
}

export interface GeneratedTargetEmitOptions {
  stdlibNamespaces?: readonly string[];
}

export interface EmitPipelineDeps {
  emitZod?: (schema: Schema, sourcePath: string, options?: GeneratedTargetEmitOptions) => string;
  emitJsonSchema?: (
    schema: Schema,
    sourcePath?: string,
    options?: GeneratedTargetEmitOptions,
  ) => unknown;
  emitSchemaIndex?: (baseName: string, sourcePath?: string) => string;
  emitConvex?: (schema: Schema, sourcePath?: string) => string;
  emitAiToolSchemas?: (schema: Schema, sourcePath?: string) => unknown;
  emitStructuredOutputSchemas?: (schema: Schema, sourcePath?: string) => unknown;
  emitMcpDefinitions?: (schema: Schema, sourcePath?: string) => unknown;
  emitFormValidators?: (schema: Schema, baseName: string, sourcePath?: string) => string;
}

interface GeneratedTargetDescriptor extends GeneratedTargetMetadata {
  path: (paths: BundlePaths) => string;
  enabled: (schema: Schema) => boolean;
  enable: (schema: Schema) => Schema;
  emit: (
    schema: Schema,
    irPath: string,
    deps: EmitPipelineDeps,
    options?: GeneratedTargetEmitOptions,
  ) => string;
}

const CORE_TARGETS = ['zod', 'jsonSchema', 'schemaIndex', 'convex'] as const;
type CoreOutputConfigKey = (typeof CORE_TARGETS)[number];

const AI_TARGETS = {
  'ai-tool-schemas': 'toolSchemas',
  'structured-output-schemas': 'structuredOutputs',
  'mcp-definitions': 'mcpDefinitions',
  'form-validators': 'formValidators',
} as const satisfies Record<
  string,
  keyof NonNullable<NonNullable<Schema['outputs']>['aiPipeline']>
>;

type AiOutputConfigKey = (typeof AI_TARGETS)[keyof typeof AI_TARGETS];

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function coreOutputEnabled(schema: Schema, key: CoreOutputConfigKey): boolean {
  return schema.outputs?.[key]?.enabled !== false;
}

function aiOutputEnabled(schema: Schema, key: AiOutputConfigKey): boolean {
  return schema.outputs?.aiPipeline?.[key]?.enabled === true;
}

function enableCoreOutput(schema: Schema, key: CoreOutputConfigKey): Schema {
  return {
    ...schema,
    outputs: {
      ...(schema.outputs ?? {}),
      [key]: { enabled: true },
    },
  };
}

function enableAiOutput(schema: Schema, key: AiOutputConfigKey): Schema {
  return {
    ...schema,
    outputs: {
      ...(schema.outputs ?? {}),
      aiPipeline: {
        ...(schema.outputs?.aiPipeline ?? {}),
        [key]: { enabled: true },
      },
    },
  };
}

export const GENERATED_TARGETS: readonly GeneratedTargetDescriptor[] = [
  {
    kind: 'zod',
    group: 'core',
    label: 'Zod schema',
    help: 'TypeScript Zod schemas for app/runtime validation.',
    language: 'typescript',
    previewable: true,
    displayPath: (baseName) => `${baseName}.schema.ts`,
    path: (paths) => paths.schemaTs,
    enabled: (schema) => coreOutputEnabled(schema, 'zod'),
    enable: (schema) => enableCoreOutput(schema, 'zod'),
    emit: (schema, irPath, deps, options) => (deps.emitZod ?? emitZod)(schema, irPath, options),
  },
  {
    kind: 'json-schema',
    group: 'core',
    label: 'JSON Schema',
    help: 'Draft 2020-12 JSON Schema for interoperable validation and tooling.',
    language: 'json',
    previewable: true,
    displayPath: (baseName) => `${baseName}.schema.json`,
    path: (paths) => paths.schemaJson,
    enabled: (schema) => coreOutputEnabled(schema, 'jsonSchema'),
    enable: (schema) => enableCoreOutput(schema, 'jsonSchema'),
    emit: (schema, irPath, deps, options) =>
      json((deps.emitJsonSchema ?? defaultEmitJsonSchema)(schema, irPath, options)),
  },
  {
    kind: 'schema-index',
    group: 'core',
    label: 'Schema index',
    help: 'Barrel module that re-exports generated TypeScript schemas.',
    language: 'typescript',
    previewable: false,
    displayPath: () => 'index.ts',
    path: (paths) => paths.schemaIndex,
    enabled: (schema) => coreOutputEnabled(schema, 'schemaIndex'),
    enable: (schema) => enableCoreOutput(schema, 'schemaIndex'),
    emit: (_schema, irPath, deps) =>
      (deps.emitSchemaIndex ?? emitSchemaIndex)(baseNameFor(irPath), irPath),
  },
  {
    kind: 'convex',
    group: 'core',
    label: 'Convex schema',
    help: 'Convex database schema generated from Contexture table types.',
    language: 'typescript',
    previewable: true,
    displayPath: () => 'convex/schema.ts',
    path: (paths) => paths.convex,
    enabled: (schema) => coreOutputEnabled(schema, 'convex'),
    enable: (schema) => enableCoreOutput(schema, 'convex'),
    emit: (schema, irPath, deps) => (deps.emitConvex ?? emitConvexSchema)(schema, irPath),
  },
  {
    kind: 'ai-tool-schemas',
    group: 'ai',
    label: 'Tool schemas',
    help: 'JSON Schema tool definitions for AI function/tool calling.',
    language: 'json',
    previewable: true,
    displayPath: () => '.contexture/ai-tool-schemas.json',
    path: (paths) => paths.aiToolSchemas,
    enabled: (schema) => aiOutputEnabled(schema, 'toolSchemas'),
    enable: (schema) => enableAiOutput(schema, 'toolSchemas'),
    emit: (schema, irPath, deps) =>
      json((deps.emitAiToolSchemas ?? emitAiToolSchemas)(schema, irPath)),
  },
  {
    kind: 'structured-output-schemas',
    group: 'ai',
    label: 'Structured outputs',
    help: 'Provider-neutral response schemas for model outputs.',
    language: 'json',
    previewable: true,
    displayPath: () => '.contexture/structured-output-schemas.json',
    path: (paths) => paths.structuredOutputSchemas,
    enabled: (schema) => aiOutputEnabled(schema, 'structuredOutputs'),
    enable: (schema) => enableAiOutput(schema, 'structuredOutputs'),
    emit: (schema, irPath, deps) =>
      json((deps.emitStructuredOutputSchemas ?? emitStructuredOutputSchemas)(schema, irPath)),
  },
  {
    kind: 'mcp-definitions',
    group: 'ai',
    label: 'MCP definitions',
    help: 'Machine-readable tool/server definitions for MCP integrations.',
    language: 'json',
    previewable: true,
    displayPath: () => '.contexture/mcp-definitions.json',
    path: (paths) => paths.mcpDefinitions,
    enabled: (schema) => aiOutputEnabled(schema, 'mcpDefinitions'),
    enable: (schema) => enableAiOutput(schema, 'mcpDefinitions'),
    emit: (schema, irPath, deps) =>
      json((deps.emitMcpDefinitions ?? emitMcpDefinitions)(schema, irPath)),
  },
  {
    kind: 'form-validators',
    group: 'forms',
    label: 'Form validators',
    help: 'Type-safe validation helpers backed by generated Zod schemas.',
    language: 'typescript',
    previewable: true,
    displayPath: () => 'form-validators.ts',
    path: (paths) => paths.formValidators,
    enabled: (schema) => aiOutputEnabled(schema, 'formValidators'),
    enable: (schema) => enableAiOutput(schema, 'formValidators'),
    emit: (schema, irPath, deps) =>
      (deps.emitFormValidators ?? emitFormValidators)(schema, baseNameFor(irPath), irPath),
  },
] as const;

export function generatedTargetDescriptor(
  kind: GeneratedTargetKind,
): GeneratedTargetDescriptor | null {
  return GENERATED_TARGETS.find((target) => target.kind === kind) ?? null;
}

export function generatedTargetMetadata(kind: GeneratedTargetKind): GeneratedTargetMetadata {
  const target = generatedTargetDescriptor(kind);
  if (!target) throw new Error(`Unknown generated target kind: ${kind}`);
  return target;
}

export function generatedTargetPath(kind: GeneratedTargetKind, irPath: string): string {
  const target = requireGeneratedTargetDescriptor(kind);
  return target.path(bundlePathsFor(irPath));
}

export function generatedTargetDisplayPath(kind: GeneratedTargetKind, baseName = 'schema'): string {
  return generatedTargetMetadata(kind).displayPath(baseName);
}

export function isGeneratedTargetEnabled(schema: Schema, kind: GeneratedTargetKind): boolean {
  return requireGeneratedTargetDescriptor(kind).enabled(schema);
}

export function enableGeneratedTarget(schema: Schema, kind: GeneratedTargetKind): Schema {
  return requireGeneratedTargetDescriptor(kind).enable(schema);
}

export function emitGeneratedTarget(
  schema: Schema,
  kind: GeneratedTargetKind,
  irPath: string,
  deps: EmitPipelineDeps = {},
  options: GeneratedTargetEmitOptions = {},
): string {
  return requireGeneratedTargetDescriptor(kind).emit(schema, irPath, deps, options);
}

export function previewableGeneratedTargets(): GeneratedTargetMetadata[] {
  return GENERATED_TARGETS.filter((target) => target.previewable);
}

export function enabledGeneratedTargets(schema: Schema, irPath: string) {
  const paths = bundlePathsFor(irPath);
  return GENERATED_TARGETS.filter((target) => target.enabled(schema)).map((target) => ({
    kind: target.kind,
    path: target.path(paths),
  }));
}

function defaultEmitJsonSchema(
  schema: Schema,
  sourcePath?: string,
  options?: GeneratedTargetEmitOptions,
): unknown {
  return emitJsonSchema(schema, undefined, sourcePath, options);
}

function requireGeneratedTargetDescriptor(kind: GeneratedTargetKind): GeneratedTargetDescriptor {
  const target = generatedTargetDescriptor(kind);
  if (!target) throw new Error(`Unknown generated target kind: ${kind}`);
  return target;
}
