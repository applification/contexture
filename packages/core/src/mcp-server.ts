import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError, z } from 'zod';
import { createFileBackedForward } from './file-forward';
import {
  FieldDefSchema,
  type FieldType,
  IndexDefSchema,
  IRSchema,
  IRSchemaObject,
  type Schema,
  type TypeDef,
  TypeDefSchema,
} from './ir';
import { load } from './load';
import type { Op } from './ops';
import { runEmitPipeline } from './pipeline';
import { checkSemantic } from './semantic-validation';

const VERSION = '0.0.0';

const IrPathInput = {
  irPath: z.string().min(1).describe('Path to a .contexture.json file.'),
};

const InspectTypeSchema = z.object({
  name: z.string(),
  kind: z.enum(['object', 'enum', 'discriminatedUnion', 'raw']),
  table: z.boolean().optional(),
  fieldCount: z.number().optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        optional: z.boolean().optional(),
        nullable: z.boolean().optional(),
      }),
    )
    .optional(),
  values: z.array(z.string()).optional(),
  variants: z.array(z.string()).optional(),
  discriminator: z.string().optional(),
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
};

const ValidationIssueSchema = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
  hint: z.string().optional(),
});

const ValidateOutput = {
  path: z.string(),
  valid: z.boolean(),
  warnings: z.array(z.string()),
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

const GeneratedFileStatusSchema = z.enum(['clean', 'drifted', 'unreadable']);

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

const ImportDeclSchema = (
  IRSchemaObject.shape.imports as z.ZodOptional<z.ZodArray<z.ZodType>>
).unwrap().element;

const OpSchema: z.ZodType<Op> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add_type'), type: TypeDefSchema }),
  z.object({
    kind: z.literal('update_type'),
    name: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({ kind: z.literal('rename_type'), from: z.string().min(1), to: z.string().min(1) }),
  z.object({ kind: z.literal('delete_type'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('add_field'),
    typeName: z.string().min(1),
    field: FieldDefSchema,
    index: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('update_field'),
    typeName: z.string().min(1),
    fieldName: z.string().min(1),
    patch: FieldDefSchema.partial(),
  }),
  z.object({
    kind: z.literal('remove_field'),
    typeName: z.string().min(1),
    fieldName: z.string().min(1),
  }),
  z.object({
    kind: z.literal('add_value'),
    typeName: z.string().min(1),
    value: z.string().min(1),
    description: z.string().optional(),
  }),
  z.object({
    kind: z.literal('update_value'),
    typeName: z.string().min(1),
    value: z.string().min(1),
    patch: z.object({
      value: z.string().min(1).optional(),
      description: z.string().optional(),
    }),
  }),
  z.object({
    kind: z.literal('remove_value'),
    typeName: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({
    kind: z.literal('reorder_fields'),
    typeName: z.string().min(1),
    order: z.array(z.string().min(1)),
  }),
  z.object({
    kind: z.literal('add_variant'),
    typeName: z.string().min(1),
    variant: z.string().min(1),
  }),
  z.object({
    kind: z.literal('set_discriminator'),
    typeName: z.string().min(1),
    discriminator: z.string().min(1),
  }),
  z.object({ kind: z.literal('add_import'), import: ImportDeclSchema }),
  z.object({ kind: z.literal('remove_import'), alias: z.string().min(1) }),
  z.object({
    kind: z.literal('set_table_flag'),
    typeName: z.string().min(1),
    table: z.boolean(),
  }),
  z.object({
    kind: z.literal('add_index'),
    typeName: z.string().min(1),
    index: IndexDefSchema,
  }),
  z.object({
    kind: z.literal('remove_index'),
    typeName: z.string().min(1),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal('update_index'),
    typeName: z.string().min(1),
    name: z.string().min(1),
    patch: IndexDefSchema.partial(),
  }),
  z.object({ kind: z.literal('replace_schema'), schema: IRSchema }),
]) as z.ZodType<Op>;

export function createContextureMcpServer(): McpServer {
  const server = new McpServer({ name: 'contexture-core', version: VERSION });

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
      const structuredContent = await validateContextureFile(irPath);
      return jsonToolResult(structuredContent);
    },
  );

  server.registerTool(
    'apply_contexture_op',
    {
      title: 'Apply Contexture Op',
      description:
        'Mutate a .contexture.json file by applying one Contexture closed-world Op, then rewrite generated artifacts.',
      inputSchema: ApplyContextureOpInput,
      outputSchema: ApplyContextureOpOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ irPath, op }) => {
      const structuredContent = await applyContextureOp(irPath, op);
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
      const structuredContent = await emitContextureBundle(irPath);
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
      const structuredContent = await checkContextureDrift(irPath);
      return jsonToolResult(structuredContent);
    },
  );

  return server;
}

async function readContextureFile(irPath: string): Promise<{ schema: Schema; warnings: string[] }> {
  const raw = await readFile(irPath, 'utf8');
  return load(raw);
}

async function validateContextureFile(
  irPath: string,
): Promise<z.infer<z.ZodObject<typeof ValidateOutput>>> {
  try {
    const { schema, warnings } = await readContextureFile(irPath);
    const errors = checkSemantic(schema).map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
      ...(issue.hint ? { hint: issue.hint } : {}),
    }));
    return { path: irPath, valid: errors.length === 0, warnings, errors };
  } catch (err) {
    return {
      path: irPath,
      valid: false,
      warnings: [],
      errors: normalizeValidationError(err),
    };
  }
}

async function applyContextureOp(
  irPath: string,
  op: Record<string, unknown>,
): Promise<z.infer<z.ZodObject<typeof ApplyContextureOpOutput>>> {
  const opKind = typeof op.kind === 'string' ? op.kind : 'unknown';
  const parsed = OpSchema.safeParse(op);
  if (!parsed.success) {
    return {
      path: irPath,
      applied: false,
      opKind,
      error: `invalid op: ${formatZodIssues(parsed.error)}`,
    };
  }

  const result = await createFileBackedForward(irPath)(parsed.data);
  if ('error' in result) {
    return { path: irPath, applied: false, opKind, error: result.error };
  }
  return {
    path: irPath,
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
): Promise<z.infer<z.ZodObject<typeof EmitContextureOutput>>> {
  const { schema } = await readContextureFile(irPath);
  const { emitted, manifest } = runEmitPipeline(schema, irPath);
  const result = await createFileBackedForward(irPath)({
    kind: 'replace_schema',
    schema,
  });
  if ('error' in result) throw new Error(result.error);
  return {
    path: irPath,
    emitted: emitted.map((file) => file.path),
    manifest,
  };
}

type GeneratedFileStatus = z.infer<typeof GeneratedFileStatusSchema>;

async function checkContextureDrift(
  irPath: string,
): Promise<z.infer<z.ZodObject<typeof CheckContextureDriftOutput>>> {
  const { schema } = await readContextureFile(irPath);
  const { emitted } = runEmitPipeline(schema, irPath);
  const files: Array<{ path: string; status: GeneratedFileStatus }> = [];

  for (const entry of emitted) {
    let onDisk: string | undefined;
    try {
      onDisk = await readFile(entry.path, 'utf8');
    } catch {
      onDisk = undefined;
    }

    if (onDisk === undefined) files.push({ path: entry.path, status: 'unreadable' });
    else if (onDisk !== entry.content) files.push({ path: entry.path, status: 'drifted' });
    else files.push({ path: entry.path, status: 'clean' });
  }

  const drift = files.filter((file) => file.status !== 'clean');
  return {
    path: irPath,
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
  };
}

function typeToInspectJson(type: TypeDef): z.infer<typeof InspectTypeSchema> {
  if (type.kind === 'object') {
    return {
      name: type.name,
      kind: 'object',
      ...(type.table ? { table: true } : {}),
      fieldCount: type.fields.length,
      fields: type.fields.map((field) => ({
        name: field.name,
        type: fieldTypeToString(field.type),
        ...(field.optional ? { optional: true } : {}),
        ...(field.nullable ? { nullable: true } : {}),
      })),
    };
  }
  if (type.kind === 'enum') {
    return {
      name: type.name,
      kind: 'enum',
      values: type.values.map((value) => value.value),
    };
  }
  if (type.kind === 'discriminatedUnion') {
    return {
      name: type.name,
      kind: 'discriminatedUnion',
      discriminator: type.discriminator,
      variants: type.variants,
    };
  }
  return { name: type.name, kind: 'raw' };
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
