/**
 * MCP op tool registry — main-side.
 *
 * The Agent SDK calls a tool per op in the Contexture vocabulary; each
 * tool's handler forwards the corresponding `Op` to the renderer (where
 * the store applies it via `store/ops.ts`) and returns the result back
 * to the SDK. `createOpTools(forward)` is the pure assembly of those
 * tool descriptors — the `forward` callback is the IPC bridge, stubbed
 * in tests so we can exercise every op without Electron or the SDK.
 *
 * Tool-schema strictness follows the hybrid policy from the pivot plan:
 *
 *   - Field-level ops expose strict Zod input schemas, so Claude gets
 *     per-field type safety at the tool boundary.
 *   - Type-level ops take a lenient `payload: z.unknown()` and re-validate
 *     the resulting `Op` app-side against the IR meta-schema before it
 *     leaves this module. Keeps the tool surface small without losing
 *     end-to-end safety.
 *   - `replace_schema` takes the full IR meta-schema directly — it's the
 *     bulk escape hatch and needs its input to parse.
 *
 * Tool descriptors are returned as a plain array; the caller wraps them
 * for the Agent SDK via its `tool()` factory at IPC registration time.
 */

import { IRSchema } from '@renderer/model/ir-schema';
import type { ApplyResult, Op } from '@renderer/store/ops';
import { type ZodTypeAny, z } from 'zod';

/**
 * Bridge that sends an `Op` to the renderer and awaits its `ApplyResult`.
 * Injected so tests can stub it; in production it's IPC over the main
 * window's `webContents`.
 */
export type ForwardOp = (op: Op) => Promise<ApplyResult>;

export interface OpToolDescriptor {
  name: string;
  description: string;
  /** A Zod *raw shape* as expected by the Agent SDK `tool()` factory. */
  inputSchema: Record<string, ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<ApplyResult>;
}

// ---- Field-type + field-def schemas (shared across strict ops) ---------

const FieldTypeSchema: z.ZodType = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal('string'),
      min: z.number().int().nonnegative().optional(),
      max: z.number().int().nonnegative().optional(),
      regex: z.string().optional(),
      format: z.enum(['email', 'url', 'uuid', 'datetime']).optional(),
    }),
    z.object({
      kind: z.literal('number'),
      min: z.number().optional(),
      max: z.number().optional(),
      int: z.boolean().optional(),
    }),
    z.object({ kind: z.literal('boolean') }),
    z.object({ kind: z.literal('date') }),
    z.object({
      kind: z.literal('literal'),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({ kind: z.literal('ref'), typeName: z.string() }),
    z.object({
      kind: z.literal('array'),
      element: FieldTypeSchema,
      min: z.number().int().nonnegative().optional(),
      max: z.number().int().nonnegative().optional(),
    }),
  ]),
);

const FieldDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: FieldTypeSchema,
  optional: z.boolean().optional(),
  nullable: z.boolean().optional(),
  default: z.unknown().optional(),
});

// ---- Tool builders ------------------------------------------------------

function strictTool<Shape extends Record<string, ZodTypeAny>>(
  name: string,
  description: string,
  shape: Shape,
  toOp: (args: z.infer<z.ZodObject<Shape>>) => Op,
  forward: ForwardOp,
): OpToolDescriptor {
  return {
    name,
    description,
    inputSchema: shape,
    handler: async (args) => {
      const parsed = z.object(shape).parse(args);
      return forward(toOp(parsed));
    },
  };
}

/**
 * Type-level op: accepts any `payload`, but the assembled `Op` must
 * leave this module in a shape that the IR meta-schema accepts when the
 * op lands. We validate at the payload boundary.
 */
function lenientTool(
  name: string,
  description: string,
  toOp: (payload: unknown) => Op,
  validate: (op: Op) => void,
  forward: ForwardOp,
): OpToolDescriptor {
  return {
    name,
    description,
    inputSchema: { payload: z.unknown() },
    handler: async (args) => {
      const op = toOp((args as { payload: unknown }).payload);
      validate(op);
      return forward(op);
    },
  };
}

// ---- IR meta-schema checks for type-level payloads ---------------------

const TypeDefItemSchema = IRSchema.shape.types.element;
const ImportDeclItemSchema = (
  IRSchema.shape.imports as z.ZodOptional<z.ZodArray<z.ZodType>>
).unwrap().element;

function assertTypeDef(value: unknown, opName: string): void {
  const res = TypeDefItemSchema.safeParse(value);
  if (!res.success) {
    throw new Error(
      `${opName}: payload is not a valid TypeDef — ${res.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
}

function assertImportDecl(value: unknown, opName: string): void {
  const res = ImportDeclItemSchema.safeParse(value);
  if (!res.success) {
    throw new Error(
      `${opName}: payload is not a valid ImportDecl — ${res.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
}

// ---- Registry ----------------------------------------------------------

export function createOpTools(forward: ForwardOp): OpToolDescriptor[] {
  return [
    // --- Field-level (strict) ---
    strictTool(
      'add_field',
      'Add a field to an object type.',
      { typeName: z.string().min(1), field: FieldDefSchema, index: z.number().int().optional() },
      ({ typeName, field, index }) => ({ kind: 'add_field', typeName, field, index }),
      forward,
    ),
    strictTool(
      'update_field',
      'Update an existing field by name.',
      {
        typeName: z.string().min(1),
        fieldName: z.string().min(1),
        patch: z.object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          type: FieldTypeSchema.optional(),
          optional: z.boolean().optional(),
          nullable: z.boolean().optional(),
          default: z.unknown().optional(),
        }),
      },
      ({ typeName, fieldName, patch }) => ({ kind: 'update_field', typeName, fieldName, patch }),
      forward,
    ),
    strictTool(
      'delete_field',
      'Delete a field by name.',
      { typeName: z.string().min(1), fieldName: z.string().min(1) },
      ({ typeName, fieldName }) => ({ kind: 'delete_field', typeName, fieldName }),
      forward,
    ),
    strictTool(
      'reorder_fields',
      "Reorder an object type's fields by listing their names in the desired order.",
      { typeName: z.string().min(1), order: z.array(z.string().min(1)) },
      ({ typeName, order }) => ({ kind: 'reorder_fields', typeName, order }),
      forward,
    ),
    strictTool(
      'add_variant',
      'Add a variant (type name) to a discriminatedUnion.',
      { typeName: z.string().min(1), variant: z.string().min(1) },
      ({ typeName, variant }) => ({ kind: 'add_variant', typeName, variant }),
      forward,
    ),
    strictTool(
      'set_discriminator',
      "Set a discriminatedUnion's discriminator field name.",
      { typeName: z.string().min(1), discriminator: z.string().min(1) },
      ({ typeName, discriminator }) => ({ kind: 'set_discriminator', typeName, discriminator }),
      forward,
    ),
    strictTool(
      'remove_import',
      'Remove an import by alias.',
      { alias: z.string().min(1) },
      ({ alias }) => ({ kind: 'remove_import', alias }),
      forward,
    ),
    // --- Type-level (lenient with meta-schema validation) ---
    lenientTool(
      'add_type',
      'Add a new TypeDef (object | enum | discriminatedUnion | raw).',
      (payload) => ({
        kind: 'add_type',
        type: payload as Op & { kind: 'add_type' } extends { type: infer T } ? T : never,
      }),
      (op) => assertTypeDef((op as Extract<Op, { kind: 'add_type' }>).type, 'add_type'),
      forward,
    ),
    lenientTool(
      'update_type',
      "Update a TypeDef's top-level properties (excluding kind/name).",
      (payload) => {
        const p = (payload ?? {}) as { name?: unknown; patch?: unknown };
        if (typeof p.name !== 'string')
          throw new Error('update_type: payload.name must be a string');
        return {
          kind: 'update_type',
          name: p.name,
          patch: (p.patch ?? {}) as Record<string, unknown>,
        };
      },
      () => undefined,
      forward,
    ),
    lenientTool(
      'rename_type',
      'Rename a TypeDef; refs and layout keys cascade.',
      (payload) => {
        const p = (payload ?? {}) as { from?: unknown; to?: unknown };
        if (typeof p.from !== 'string' || typeof p.to !== 'string') {
          throw new Error('rename_type: payload.from and payload.to must be strings');
        }
        return { kind: 'rename_type', from: p.from, to: p.to };
      },
      () => undefined,
      forward,
    ),
    lenientTool(
      'delete_type',
      'Delete a TypeDef by name.',
      (payload) => {
        const p = (payload ?? {}) as { name?: unknown };
        if (typeof p.name !== 'string')
          throw new Error('delete_type: payload.name must be a string');
        return { kind: 'delete_type', name: p.name };
      },
      () => undefined,
      forward,
    ),
    lenientTool(
      'add_import',
      'Add an import declaration (stdlib or relative).',
      (payload) => ({
        kind: 'add_import',
        import: payload as Extract<Op, { kind: 'add_import' }>['import'],
      }),
      (op) => assertImportDecl((op as Extract<Op, { kind: 'add_import' }>).import, 'add_import'),
      forward,
    ),
    // --- Full IR escape hatch ---
    {
      name: 'replace_schema',
      description: 'Bulk rewrite: replace the entire IR. Use only when surgical ops are awkward.',
      inputSchema: { schema: z.unknown() },
      handler: async (args) => {
        const { schema } = args as { schema: unknown };
        const res = IRSchema.safeParse(schema);
        if (!res.success) {
          throw new Error(
            `replace_schema: invalid IR — ${res.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ')}`,
          );
        }
        return forward({ kind: 'replace_schema', schema: res.data });
      },
    },
  ];
}
