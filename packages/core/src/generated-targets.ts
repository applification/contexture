import { emitAiToolSchemas } from './emit-ai-tool-schemas';
import { emitConvexSchema, emitConvexValidators } from './emit-convex';
import { emitFormValidators } from './emit-form-validators';
import { emit as emitJsonSchema } from './emit-json-schema';
import { emitMcpDefinitions } from './emit-mcp-definitions';
import { emit as emitSchemaIndex } from './emit-schema-index';
import { emitStructuredOutputSchemas } from './emit-structured-output-schemas';
import { emit as emitZod } from './emit-zod';
import type { Schema } from './ir';
import {
  type BundlePaths,
  baseNameFor,
  bundlePathsFor,
  type GeneratedTargetKind,
  moduleSpecifierBetween,
} from './paths';

export type GeneratedTargetGroup = 'convex' | 'supporting' | 'agent';
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
  stdlibModuleForNamespace?: (namespace: string) => string | null | undefined;
}

export interface StdlibRuntimeModule {
  namespace: string;
  schema: Schema;
}

export interface EmitPipelineDeps {
  emitZod?: (schema: Schema, sourcePath: string, options?: GeneratedTargetEmitOptions) => string;
  emitJsonSchema?: (
    schema: Schema,
    sourcePath?: string,
    options?: GeneratedTargetEmitOptions,
  ) => unknown;
  emitSchemaIndex?: (baseName: string, sourcePath?: string, schemaModule?: string) => string;
  emitConvex?: (schema: Schema, sourcePath?: string) => string;
  emitConvexValidators?: (schema: Schema, sourcePath?: string) => string;
  emitAiToolSchemas?: (schema: Schema, sourcePath?: string) => unknown;
  emitStructuredOutputSchemas?: (schema: Schema, sourcePath?: string) => unknown;
  emitMcpDefinitions?: (schema: Schema, sourcePath?: string) => unknown;
  emitFormValidators?: (
    schema: Schema,
    baseName: string,
    sourcePath?: string,
    schemaModule?: string,
  ) => string;
  stdlibRuntime?: readonly StdlibRuntimeModule[];
}

interface GeneratedTargetDescriptor extends GeneratedTargetMetadata {
  path: (paths: BundlePaths) => string;
  enabled: (schema: Schema) => boolean;
  enable: (schema: Schema) => Schema;
  emit: (
    schema: Schema,
    irPath: string,
    paths: BundlePaths,
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
    kind: 'convex',
    group: 'convex',
    label: 'Convex schema',
    help: 'Primary Convex database schema generated from Contexture table types.',
    language: 'typescript',
    previewable: true,
    displayPath: () => 'convex/schema.ts',
    path: (paths) => paths.convex,
    enabled: (schema) => coreOutputEnabled(schema, 'convex'),
    enable: (schema) => enableCoreOutput(schema, 'convex'),
    emit: (schema, irPath, _paths, deps) => (deps.emitConvex ?? emitConvexSchema)(schema, irPath),
  },
  {
    kind: 'convex-validators',
    group: 'convex',
    label: 'Convex validators',
    help: 'Reusable Convex validators for functions, forms, and app boundaries.',
    language: 'typescript',
    previewable: true,
    displayPath: () => 'convex/validators.ts',
    path: (paths) => paths.convexValidators,
    enabled: (schema) => coreOutputEnabled(schema, 'convex'),
    enable: (schema) => enableCoreOutput(schema, 'convex'),
    emit: (schema, irPath, _paths, deps) =>
      (deps.emitConvexValidators ?? emitConvexValidators)(schema, irPath),
  },
  {
    kind: 'zod',
    group: 'supporting',
    label: 'Zod schema',
    help: 'Supporting TypeScript Zod schemas for app/runtime validation.',
    language: 'typescript',
    previewable: true,
    displayPath: (baseName) => `${baseName}.schema.ts`,
    path: (paths) => paths.schemaTs,
    enabled: (schema) => coreOutputEnabled(schema, 'zod'),
    enable: (schema) => enableCoreOutput(schema, 'zod'),
    emit: (schema, irPath, _paths, deps, options) =>
      (deps.emitZod ?? emitZod)(schema, irPath, options),
  },
  {
    kind: 'json-schema',
    group: 'supporting',
    label: 'JSON Schema',
    help: 'Supporting Draft 2020-12 JSON Schema for interoperable validation and tooling.',
    language: 'json',
    previewable: true,
    displayPath: (baseName) => `${baseName}.schema.json`,
    path: (paths) => paths.schemaJson,
    enabled: (schema) => coreOutputEnabled(schema, 'jsonSchema'),
    enable: (schema) => enableCoreOutput(schema, 'jsonSchema'),
    emit: (schema, irPath, _paths, deps, options) =>
      json((deps.emitJsonSchema ?? defaultEmitJsonSchema)(schema, irPath, options)),
  },
  {
    kind: 'schema-index',
    group: 'supporting',
    label: 'Schema index',
    help: 'Supporting barrel module that re-exports generated TypeScript schemas.',
    language: 'typescript',
    previewable: false,
    displayPath: () => 'index.ts',
    path: (paths) => paths.schemaIndex,
    enabled: (schema) => coreOutputEnabled(schema, 'schemaIndex'),
    enable: (schema) => enableCoreOutput(schema, 'schemaIndex'),
    emit: (_schema, irPath, paths, deps) =>
      (deps.emitSchemaIndex ?? emitSchemaIndex)(
        baseNameFor(irPath),
        irPath,
        moduleSpecifierBetween(paths.schemaIndex, paths.schemaTs),
      ),
  },
  {
    kind: 'ai-tool-schemas',
    group: 'agent',
    label: 'Tool schemas',
    help: 'JSON Schema tool definitions for AI function/tool calling.',
    language: 'json',
    previewable: true,
    displayPath: () => '.contexture/ai-tool-schemas.json',
    path: (paths) => paths.aiToolSchemas,
    enabled: (schema) => aiOutputEnabled(schema, 'toolSchemas'),
    enable: (schema) => enableAiOutput(schema, 'toolSchemas'),
    emit: (schema, irPath, _paths, deps) =>
      json((deps.emitAiToolSchemas ?? emitAiToolSchemas)(schema, irPath)),
  },
  {
    kind: 'structured-output-schemas',
    group: 'agent',
    label: 'Structured outputs',
    help: 'Provider-neutral response schemas for model outputs.',
    language: 'json',
    previewable: true,
    displayPath: () => '.contexture/structured-output-schemas.json',
    path: (paths) => paths.structuredOutputSchemas,
    enabled: (schema) => aiOutputEnabled(schema, 'structuredOutputs'),
    enable: (schema) => enableAiOutput(schema, 'structuredOutputs'),
    emit: (schema, irPath, _paths, deps) =>
      json((deps.emitStructuredOutputSchemas ?? emitStructuredOutputSchemas)(schema, irPath)),
  },
  {
    kind: 'mcp-definitions',
    group: 'agent',
    label: 'MCP definitions',
    help: 'Machine-readable tool/server definitions for MCP integrations.',
    language: 'json',
    previewable: true,
    displayPath: () => '.contexture/mcp-definitions.json',
    path: (paths) => paths.mcpDefinitions,
    enabled: (schema) => aiOutputEnabled(schema, 'mcpDefinitions'),
    enable: (schema) => enableAiOutput(schema, 'mcpDefinitions'),
    emit: (schema, irPath, _paths, deps) =>
      json((deps.emitMcpDefinitions ?? emitMcpDefinitions)(schema, irPath)),
  },
  {
    kind: 'form-validators',
    group: 'agent',
    label: 'Form validators',
    help: 'Type-safe validation helpers backed by generated model contracts.',
    language: 'typescript',
    previewable: true,
    displayPath: () => 'form-validators.ts',
    path: (paths) => paths.formValidators,
    enabled: (schema) => aiOutputEnabled(schema, 'formValidators'),
    enable: (schema) => enableAiOutput(schema, 'formValidators'),
    emit: (schema, irPath, paths, deps) =>
      (deps.emitFormValidators ?? emitFormValidators)(
        schema,
        baseNameFor(irPath),
        irPath,
        moduleSpecifierBetween(paths.formValidators, paths.schemaTs),
      ),
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

export function generatedTargetPath(
  kind: GeneratedTargetKind,
  irPath: string,
  schema?: Schema,
): string {
  const target = requireGeneratedTargetDescriptor(kind);
  return target.path(bundlePathsFor(irPath, schema));
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

export function generatedTargetOutputDir(schema: Schema, kind: GeneratedTargetKind): string | null {
  switch (kind) {
    case 'zod':
      return schema.outputs?.zod?.dir ?? null;
    case 'json-schema':
      return schema.outputs?.jsonSchema?.dir ?? null;
    case 'schema-index':
      return schema.outputs?.schemaIndex?.dir ?? null;
    case 'convex':
    case 'convex-validators':
      return schema.outputs?.convex?.dir ?? null;
    case 'ai-tool-schemas':
      return schema.outputs?.aiPipeline?.toolSchemas?.dir ?? null;
    case 'structured-output-schemas':
      return schema.outputs?.aiPipeline?.structuredOutputs?.dir ?? null;
    case 'mcp-definitions':
      return schema.outputs?.aiPipeline?.mcpDefinitions?.dir ?? null;
    case 'form-validators':
      return schema.outputs?.aiPipeline?.formValidators?.dir ?? null;
  }
}

export function setGeneratedTargetOutputDir(
  schema: Schema,
  kind: GeneratedTargetKind,
  dir: string | null,
): Schema {
  const nextConfig = (config: { enabled?: boolean; dir?: string } | undefined) => {
    const next = { ...(config ?? {}) };
    if (dir === null) delete next.dir;
    else next.dir = dir;
    return next;
  };

  switch (kind) {
    case 'zod':
      return {
        ...schema,
        outputs: { ...(schema.outputs ?? {}), zod: nextConfig(schema.outputs?.zod) },
      };
    case 'json-schema':
      return {
        ...schema,
        outputs: { ...(schema.outputs ?? {}), jsonSchema: nextConfig(schema.outputs?.jsonSchema) },
      };
    case 'schema-index':
      return {
        ...schema,
        outputs: {
          ...(schema.outputs ?? {}),
          schemaIndex: nextConfig(schema.outputs?.schemaIndex),
        },
      };
    case 'convex':
    case 'convex-validators':
      return {
        ...schema,
        outputs: { ...(schema.outputs ?? {}), convex: nextConfig(schema.outputs?.convex) },
      };
    case 'ai-tool-schemas':
      return {
        ...schema,
        outputs: {
          ...(schema.outputs ?? {}),
          aiPipeline: {
            ...(schema.outputs?.aiPipeline ?? {}),
            toolSchemas: nextConfig(schema.outputs?.aiPipeline?.toolSchemas),
          },
        },
      };
    case 'structured-output-schemas':
      return {
        ...schema,
        outputs: {
          ...(schema.outputs ?? {}),
          aiPipeline: {
            ...(schema.outputs?.aiPipeline ?? {}),
            structuredOutputs: nextConfig(schema.outputs?.aiPipeline?.structuredOutputs),
          },
        },
      };
    case 'mcp-definitions':
      return {
        ...schema,
        outputs: {
          ...(schema.outputs ?? {}),
          aiPipeline: {
            ...(schema.outputs?.aiPipeline ?? {}),
            mcpDefinitions: nextConfig(schema.outputs?.aiPipeline?.mcpDefinitions),
          },
        },
      };
    case 'form-validators':
      return {
        ...schema,
        outputs: {
          ...(schema.outputs ?? {}),
          aiPipeline: {
            ...(schema.outputs?.aiPipeline ?? {}),
            formValidators: nextConfig(schema.outputs?.aiPipeline?.formValidators),
          },
        },
      };
  }
}

export function emitGeneratedTarget(
  schema: Schema,
  kind: GeneratedTargetKind,
  irPath: string,
  deps: EmitPipelineDeps = {},
  options: GeneratedTargetEmitOptions = {},
): string {
  return requireGeneratedTargetDescriptor(kind).emit(
    schema,
    irPath,
    bundlePathsFor(irPath, schema),
    deps,
    options,
  );
}

export function previewableGeneratedTargets(): GeneratedTargetMetadata[] {
  return GENERATED_TARGETS.filter((target) => target.previewable);
}

export function enabledGeneratedTargets(schema: Schema, irPath: string) {
  const paths = bundlePathsFor(irPath, schema);
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
