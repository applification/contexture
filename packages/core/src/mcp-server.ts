import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError, z } from 'zod';
import { createFileBackedForward, nodeFileBackedFs } from './file-forward';
import { checkGeneratedBundle, writeGeneratedBundle } from './generated-bundle-writer';
import { GENERATED_TARGETS } from './generated-targets';
import type { FieldType, Schema, TypeDef } from './ir';
import { load } from './load';
import { analyzeModelingHints } from './modeling-hints';
import { createOpTools } from './op-tools';
import { OpSchema } from './ops';
import { assertContextureIrPath, bundlePathsFor } from './paths';
import type { EmitPipelineDeps } from './pipeline';
import { checkSemantic, type StdlibCatalog } from './semantic-validation';

const DEFAULT_VERSION = '0.0.0';

export interface ContextureMcpServerOptions {
  stdlib?: StdlibCatalog;
  emitDeps?: EmitPipelineDeps;
  version?: string;
}

const IrPathInput = {
  irPath: z.string().min(1).describe('Path to a .contexture.json file.'),
};

const InspectTypeSchema = z.object({
  name: z.string(),
  kind: z.enum(['object', 'enum', 'discriminatedUnion', 'raw']),
  description: z.string().optional(),
  table: z.boolean().optional(),
  tableName: z.string().optional(),
  fieldCount: z.number().optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        type: z.string(),
        optional: z.boolean().optional(),
        nullable: z.boolean().optional(),
      }),
    )
    .optional(),
  indexes: z
    .array(
      z.object({
        name: z.string(),
        fields: z.array(z.string()),
      }),
    )
    .optional(),
  values: z.array(z.string()).optional(),
  variants: z.array(z.string()).optional(),
  discriminator: z.string().optional(),
});

const GeneratedTargetInspectSchema = z.object({
  kind: z.string(),
  group: z.enum(['convex', 'supporting', 'agent']),
  label: z.string(),
  path: z.string(),
  enabled: z.boolean(),
});

const ModelingHintInspectSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'owned_value_object',
    'possible_entity',
    'query_handle',
    'derivation_policy',
    'embedded_collection',
    'stdlib_type',
    'stringly_ref',
  ]),
  signals: z.array(
    z.enum([
      'identity_pressure',
      'query_pressure',
      'derivation_pressure',
      'embedded_collection_pressure',
      'concurrency_pressure',
      'document_size_pressure',
      'lifecycle_pressure',
      'relationship_pressure',
    ]),
  ),
  path: z.string(),
  typeName: z.string(),
  fieldName: z.string().optional(),
  title: z.string(),
  message: z.string(),
  rationale: z.string(),
  fieldNames: z.array(z.string()),
  action: z
    .union([
      z.object({ kind: z.literal('use_stdlib_type'), typeName: z.string() }),
      z.object({ kind: z.literal('convert_to_ref'), typeName: z.string() }),
    ])
    .optional(),
});

const InspectOutput = {
  path: z.string(),
  version: z.literal('1'),
  name: z.string().optional(),
  typeCount: z.number(),
  types: z.array(InspectTypeSchema),
  imports: z.array(
    z.object({
      kind: z.enum(['stdlib', 'relative']),
      alias: z.string(),
      path: z.string(),
    }),
  ),
  outputConfig: z.unknown().optional(),
  generatedTargets: z.array(GeneratedTargetInspectSchema),
  modelingHints: z.array(ModelingHintInspectSchema),
  agent: z.object({
    preferredMutationTools: z.array(z.string()),
    safeLoop: z.array(z.string()),
  }),
};

const ValidationIssueSchema = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']).optional(),
  hint: z.string().optional(),
});

const ValidateOutput = {
  path: z.string(),
  valid: z.boolean(),
  mcp: z.object({
    version: z.string(),
  }),
  warnings: z.array(z.union([z.string(), ValidationIssueSchema])),
  errors: z.array(ValidationIssueSchema),
};

const ApplyContextureOpInput = {
  irPath: IrPathInput.irPath,
  op: z.record(z.string(), z.unknown()).describe('A Contexture closed-world Op object.'),
};

const ApplyContextureOpOutput = {
  path: z.string(),
  applied: z.boolean(),
  opKind: z.string(),
  error: z.string().optional(),
  typeCount: z.number().optional(),
};

const EmitContextureOutput = {
  path: z.string(),
  emitted: z.array(z.string()),
  manifest: z.object({
    version: z.literal('1'),
    files: z.record(z.string(), z.string()),
  }),
};

const GeneratedFileStatusSchema = z.enum(['clean', 'missing', 'drifted', 'unreadable']);

const CheckContextureDriftOutput = {
  path: z.string(),
  clean: z.boolean(),
  checked: z.number(),
  files: z.array(
    z.object({
      path: z.string(),
      status: GeneratedFileStatusSchema,
    }),
  ),
  drift: z.array(
    z.object({
      path: z.string(),
      status: GeneratedFileStatusSchema,
    }),
  ),
};

const IntegrationGuidanceOutput = {
  path: z.string(),
  sourceOfTruth: z.literal('.contexture.json'),
  safeLoop: z.array(z.string()),
  preferredMutationTools: z.array(z.string()),
  rules: z.array(z.string()),
  prompt: z.string(),
};

export function createContextureMcpServer(options: ContextureMcpServerOptions = {}): McpServer {
  const version = options.version ?? DEFAULT_VERSION;
  const server = new McpServer({ name: 'contexture-core', version });

  server.registerTool(
    'inspect_contexture',
    {
      title: 'Inspect Contexture IR',
      description: 'Read a .contexture.json file and summarize its schema types and imports.',
      inputSchema: IrPathInput,
      outputSchema: InspectOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ irPath }) => {
      const { schema } = await readContextureFile(irPath);
      const structuredContent = buildInspectSummary(schema, irPath);
      return jsonToolResult(structuredContent);
    },
  );

  server.registerTool(
    'validate_contexture',
    {
      title: 'Validate Contexture IR',
      description:
        'Validate a .contexture.json file with @contexture/core structural and semantic checks.',
      inputSchema: IrPathInput,
      outputSchema: ValidateOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ irPath }) => {
      const structuredContent = await validateContextureFile(irPath, options.stdlib, version);
      return jsonToolResult(structuredContent);
    },
  );

  server.registerTool(
    'apply_contexture_op',
    {
      title: 'Apply Contexture Op',
      description:
        'Mutate a .contexture.json file by applying one Contexture closed-world Op, then rewrite generated artifacts. Input is { irPath, op }; op must include its kind, for example { kind: "add_type", type: { kind: "enum", name: "Status", values: [{ value: "active" }] } }. For typed tools such as add_type, use their direct input shape instead.',
      inputSchema: ApplyContextureOpInput,
      outputSchema: ApplyContextureOpOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ irPath, op }) => {
      const structuredContent = await applyContextureOp(
        irPath,
        op,
        options.stdlib,
        options.emitDeps,
      );
      return jsonToolResult(structuredContent);
    },
  );

  server.registerTool(
    'emit_contexture',
    {
      title: 'Emit Contexture Bundle',
      description:
        'Regenerate Contexture artifacts from a .contexture.json file without changing the schema.',
      inputSchema: IrPathInput,
      outputSchema: EmitContextureOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ irPath }) => {
      const structuredContent = await emitContextureBundle(irPath, options.emitDeps);
      return jsonToolResult(structuredContent);
    },
  );

  server.registerTool(
    'check_contexture_drift',
    {
      title: 'Check Contexture Generated Drift',
      description:
        'Compare generated Contexture artifacts on disk with the current .contexture.json file.',
      inputSchema: IrPathInput,
      outputSchema: CheckContextureDriftOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ irPath }) => {
      const structuredContent = await checkContextureDrift(irPath, options.emitDeps);
      return jsonToolResult(structuredContent);
    },
  );

  server.registerTool(
    'get_contexture_integration_guidance',
    {
      title: 'Get Contexture Integration Guidance',
      description:
        'Return concise repo-integration guidance for agents using Contexture as the source of truth.',
      inputSchema: IrPathInput,
      outputSchema: IntegrationGuidanceOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ irPath }) => {
      const path = assertContextureIrPath(irPath);
      const structuredContent = buildIntegrationGuidance(path);
      return jsonToolResult(structuredContent);
    },
  );

  for (const tool of createOpTools(async () => ({ error: 'unbound MCP op tool' }))) {
    server.registerTool(
      tool.name,
      {
        title: `Contexture ${tool.name}`,
        description: `${tool.description} Include irPath with this typed tool call. This typed tool receives its direct input shape; do not wrap it in the generic apply_contexture_op { op: ... } envelope. Mutates the .contexture.json file through the shared Contexture op applier and rewrites generated artifacts.`,
        inputSchema: { ...IrPathInput, ...tool.inputSchema },
        outputSchema: ApplyContextureOpOutput,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
        },
      },
      async (args) => {
        const structuredContent = await applyTypedContextureOp(
          tool.name,
          args,
          options.stdlib,
          options.emitDeps,
        );
        return jsonToolResult(structuredContent);
      },
    );
  }

  return server;
}

async function readContextureFile(irPath: string): Promise<{ schema: Schema; warnings: string[] }> {
  const path = assertContextureIrPath(irPath);
  const raw = await readFile(path, 'utf8');
  return load(raw);
}

async function validateContextureFile(
  irPath: string,
  catalog?: StdlibCatalog,
  version = DEFAULT_VERSION,
): Promise<z.infer<z.ZodObject<typeof ValidateOutput>>> {
  try {
    const { schema, warnings } = await readContextureFile(irPath);
    const semanticIssues = checkSemantic(schema, catalog).map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
      severity: issue.severity,
      ...(issue.hint ? { hint: issue.hint } : {}),
    }));
    const errors = semanticIssues.filter((issue) => issue.severity === 'error');
    const semanticWarnings = semanticIssues.filter((issue) => issue.severity === 'warning');
    return {
      path: irPath,
      valid: errors.length === 0,
      mcp: { version },
      warnings: [...warnings, ...semanticWarnings],
      errors,
    };
  } catch (err) {
    return {
      path: irPath,
      valid: false,
      mcp: { version },
      warnings: [],
      errors: normalizeValidationError(err),
    };
  }
}

async function applyContextureOp(
  irPath: string,
  op: Record<string, unknown>,
  catalog?: StdlibCatalog,
  emitDeps?: EmitPipelineDeps,
): Promise<z.infer<z.ZodObject<typeof ApplyContextureOpOutput>>> {
  const opKind = typeof op.kind === 'string' ? op.kind : 'unknown';
  const path = assertContextureIrPath(irPath);
  const parsed = OpSchema.safeParse(op);
  if (!parsed.success) {
    return {
      path,
      applied: false,
      opKind,
      error: `invalid op: ${formatZodIssues(parsed.error)}`,
    };
  }

  let result: Awaited<ReturnType<ReturnType<typeof createFileBackedForward>>>;
  try {
    result = await createFileBackedForward(path, {
      stdlib: catalog,
      emitDeps,
      changeSource: 'mcp',
    })(parsed.data);
  } catch (err) {
    return {
      path,
      applied: false,
      opKind,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if ('error' in result) {
    return { path, applied: false, opKind, error: result.error };
  }
  return {
    path,
    applied: true,
    opKind,
    typeCount: result.schema.types.length,
  };
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

async function emitContextureBundle(
  irPath: string,
  emitDeps?: EmitPipelineDeps,
): Promise<z.infer<z.ZodObject<typeof EmitContextureOutput>>> {
  const path = assertContextureIrPath(irPath);
  const { schema } = await readContextureFile(path);
  const { emitted, manifest } = await writeGeneratedBundle({
    irPath: path,
    schema,
    fs: nodeFileBackedFs,
    emitDeps,
    driftPreflight: false,
  });
  return {
    path,
    emitted: emitted.map((file) => file.path),
    manifest,
  };
}

async function checkContextureDrift(
  irPath: string,
  emitDeps?: EmitPipelineDeps,
): Promise<z.infer<z.ZodObject<typeof CheckContextureDriftOutput>>> {
  const path = assertContextureIrPath(irPath);
  const { schema } = await readContextureFile(path);
  const files = await checkGeneratedBundle(schema, path, nodeFileBackedFs, emitDeps);

  const drift = files.filter((file) => file.status !== 'clean');
  return {
    path,
    clean: drift.length === 0,
    checked: files.length,
    files,
    drift,
  };
}

function normalizeValidationError(err: unknown): Array<z.infer<typeof ValidationIssueSchema>> {
  if (err instanceof ZodError) {
    return err.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }
  return [
    {
      code: 'invalid_contexture_file',
      path: '',
      message: err instanceof Error ? err.message : String(err),
    },
  ];
}

function buildInspectSummary(
  schema: Schema,
  irPath: string,
): z.infer<z.ZodObject<typeof InspectOutput>> {
  const paths = bundlePathsFor(irPath, schema);
  const preferredMutationTools = createOpTools(async () => ({ error: 'inspect only' })).map(
    (tool) => tool.name,
  );
  return {
    path: irPath,
    version: schema.version,
    ...(schema.metadata?.name ? { name: schema.metadata.name } : {}),
    typeCount: schema.types.length,
    types: schema.types.map(typeToInspectJson),
    imports: (schema.imports ?? []).map((imp) => ({
      kind: imp.kind,
      alias: imp.alias,
      path: imp.path,
    })),
    ...(schema.outputs ? { outputConfig: schema.outputs } : {}),
    generatedTargets: GENERATED_TARGETS.map((target) => ({
      kind: target.kind,
      group: target.group,
      label: target.label,
      path: target.path(paths),
      enabled: target.enabled(schema),
    })),
    modelingHints: analyzeModelingHints(schema),
    agent: {
      preferredMutationTools,
      safeLoop: [
        'inspect_contexture',
        'validate_contexture',
        'emit_contexture',
        'check_contexture_drift',
      ],
    },
  };
}

function typeToInspectJson(type: TypeDef): z.infer<typeof InspectTypeSchema> {
  if (type.kind === 'object') {
    return {
      name: type.name,
      kind: 'object',
      ...(type.description ? { description: type.description } : {}),
      ...(type.table ? { table: true } : {}),
      ...(type.table ? { tableName: type.tableName ?? convexTableName(type.name) } : {}),
      fieldCount: type.fields.length,
      fields: type.fields.map((field) => ({
        name: field.name,
        ...(field.description ? { description: field.description } : {}),
        type: fieldTypeToString(field.type),
        ...(field.optional ? { optional: true } : {}),
        ...(field.nullable ? { nullable: true } : {}),
      })),
      ...((type.indexes?.length ?? 0) > 0
        ? {
            indexes: type.indexes?.map((index) => ({
              name: index.name,
              fields: index.fields,
            })),
          }
        : {}),
    };
  }
  if (type.kind === 'enum') {
    return {
      name: type.name,
      kind: 'enum',
      ...(type.description ? { description: type.description } : {}),
      values: type.values.map((value) => value.value),
    };
  }
  if (type.kind === 'discriminatedUnion') {
    return {
      name: type.name,
      kind: 'discriminatedUnion',
      ...(type.description ? { description: type.description } : {}),
      discriminator: type.discriminator,
      variants: type.variants,
    };
  }
  return {
    name: type.name,
    kind: 'raw',
    ...(type.description ? { description: type.description } : {}),
  };
}

function convexTableName(typeName: string): string {
  return `${typeName.charAt(0).toLowerCase()}${typeName.slice(1)}`;
}

async function applyTypedContextureOp(
  opKind: string,
  args: Record<string, unknown>,
  catalog?: StdlibCatalog,
  emitDeps?: EmitPipelineDeps,
): Promise<z.infer<z.ZodObject<typeof ApplyContextureOpOutput>>> {
  const irPath = typeof args.irPath === 'string' ? args.irPath : '';
  let path: string;
  try {
    path = assertContextureIrPath(irPath);
  } catch (err) {
    return {
      path: irPath,
      applied: false,
      opKind,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const { irPath: _irPath, ...toolArgs } = args;
  const tools = new Map(
    createOpTools(
      createFileBackedForward(path, { stdlib: catalog, emitDeps, changeSource: 'mcp' }),
    ).map((tool) => [tool.name, tool]),
  );
  const tool = tools.get(opKind);
  if (!tool) return { path, applied: false, opKind, error: `unknown op tool: ${opKind}` };

  try {
    const result = await tool.handler(toolArgs);
    if ('error' in result) return { path, applied: false, opKind, error: result.error };
    return {
      path,
      applied: true,
      opKind,
      typeCount: result.schema.types.length,
    };
  } catch (err) {
    return {
      path,
      applied: false,
      opKind,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildIntegrationGuidance(
  irPath: string,
): z.infer<z.ZodObject<typeof IntegrationGuidanceOutput>> {
  const preferredMutationTools = createOpTools(async () => ({ error: 'guidance only' })).map(
    (tool) => tool.name,
  );
  const safeLoop = [
    'inspect_contexture',
    'validate_contexture',
    'emit_contexture',
    'check_contexture_drift',
  ];
  return {
    path: irPath,
    sourceOfTruth: '.contexture.json',
    safeLoop,
    preferredMutationTools,
    rules: [
      'Treat the .contexture.json IR as the source of truth for domain-model changes.',
      'Do not hand-edit generated files with a @contexture-generated marker; change the IR and emit instead.',
      'Prefer typed op tools such as add_type, add_field, rename_type, set_table_flag, and add_index over apply_contexture_op when possible.',
      'Typed op tools take irPath plus their direct arguments. The generic apply_contexture_op takes { irPath, op } where op is the closed-world operation with a kind.',
      'For Convex table refs, put relationship intent under field.type.relationship, for example { onDelete: "restrict", ownership: { scopeField: "householdId" } }. Use relationship.crossScope: true for intentional cross-scope refs.',
      'After any model mutation, validate, emit generated targets, and check drift before finishing.',
      'Wire generated outputs into the existing app architecture; Contexture does not own arbitrary application code.',
    ],
    prompt: `Use the Contexture MCP server to inspect ${irPath}, make domain-model changes with typed op tools, validate the IR, emit generated Convex and supporting targets, and check drift before finishing.`,
  };
}

function fieldTypeToString(type: FieldType): string {
  switch (type.kind) {
    case 'string':
      return type.format ? `string<${type.format}>` : 'string';
    case 'number':
      return type.int ? 'integer' : 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'literal':
      return `literal(${JSON.stringify(type.value)})`;
    case 'ref':
      return type.typeName;
    case 'array':
      return `${fieldTypeToString(type.element)}[]`;
  }
}

function jsonToolResult<T extends Record<string, unknown>>(structuredContent: T) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}
