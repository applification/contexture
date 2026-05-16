import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError, z } from 'zod';
import type { FieldType, Schema, TypeDef } from './ir';
import { load } from './load';
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
