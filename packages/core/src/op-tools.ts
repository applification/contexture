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

import { type ZodTypeAny, z } from 'zod';
import { IRSchema, IRSchemaObject, ObjectInvariantSchema } from './ir';
import { type ApplyResult, type Op, OpSchema } from './ops';

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

const RelationshipSchema = z.object({
  name: z.string().min(1).optional(),
  onDelete: z.enum(['none', 'restrict', 'cascade', 'setNull']).optional(),
  crossScope: z
    .boolean()
    .describe('Set true to mark this table ref as intentionally cross-scope.')
    .optional(),
  ownership: z
    .object({
      scopeField: z.string().min(1),
      targetScopeField: z.string().min(1).optional(),
    })
    .optional(),
});

// Using z.lazy keeps the recursive `array.element` case honest (the
// inner FieldType needs the outer FieldType's schema); but we cast the
// whole expression to the hand-written `FieldType` so downstream
// z.infer callers (FieldDefSchema, update_field's patch) see the right
// discriminated-union type instead of `unknown`.
const FieldTypeSchema: z.ZodType<import('./ir').FieldType> = z.lazy(() =>
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
    z.object({
      kind: z.literal('ref'),
      typeName: z
        .string()
        .describe(
          'Either a local TypeDef name from this schema, or a qualified ' +
            '"<namespace>.<TypeName>" for a stdlib type (e.g. ' +
            '"place.CountryCode", "money.Money", "common.Email"). ' +
            'Bare names that do not match a local type WILL be rejected ' +
            'by the op layer — the namespace prefix is mandatory for ' +
            'stdlib refs.',
        ),
      relationship: RelationshipSchema.describe(
        'Relationship intent for refs to Convex table types. Use onDelete for delete policy, ownership.scopeField/targetScopeField for same-tenant checks, or crossScope: true for intentional cross-scope refs.',
      ).optional(),
    }),
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
  serverDerived: z.boolean().optional(),
  derivation: z
    .object({
      kind: z.enum(['computed', 'cachedHandle', 'snapshot', 'rollup', 'estimate']),
      sources: z.array(z.string().min(1)).optional(),
      refresh: z.enum(['onWrite', 'asyncJob', 'onRead', 'manual', 'frozen', 'external']).optional(),
      driftPolicy: z.enum(['mustMatch', 'eventual', 'allowed', 'warnWhenStale']).optional(),
      owner: z.enum(['backend', 'client', 'external']).optional(),
      writableBy: z
        .array(z.enum(['backend', 'client', 'agent', 'external']))
        .min(1)
        .optional(),
      staleField: z.string().min(1).optional(),
      confidenceField: z.string().min(1).optional(),
    })
    .describe(
      'Derivation/provenance policy for stored computed, cached, snapshot, rollup, or estimated fields. Use sources for source field paths, refresh for recompute cadence, driftPolicy for acceptable staleness, owner for write ownership, and writableBy to constrain client/agent/backend/external inputs.',
    )
    .optional(),
  sampleData: z
    .object({
      category: z.string().min(1).optional(),
      generator: z.string().min(1).optional(),
    })
    .optional(),
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
  aliases: Record<string, ZodTypeAny> = {},
): OpToolDescriptor {
  return {
    name,
    description,
    inputSchema: { payload: z.unknown().optional(), ...aliases },
    handler: async (args) => {
      const op = toOp(unwrapFlexiblePayload(args));
      validate(op);
      return forward(op);
    },
  };
}

function flexiblePayloadTool<Shape extends Record<string, ZodTypeAny>>(
  name: string,
  description: string,
  shape: Shape,
  toOp: (payload: unknown) => Op,
  validate: (op: Op) => void,
  forward: ForwardOp,
): OpToolDescriptor {
  return {
    name,
    description,
    inputSchema: { ...shape, payload: z.unknown().optional() },
    handler: async (args) => {
      const payload = unwrapFlexiblePayload(args);
      const op = toOp(payload);
      validate(op);
      return forward(op);
    },
  };
}

function unwrapFlexiblePayload(args: Record<string, unknown>): unknown {
  const raw = 'payload' in args ? args.payload : args;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'payload' in raw) {
    return (raw as { payload: unknown }).payload;
  }
  return raw;
}

function unwrapTypeDefPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if ('type' in payload && !('kind' in payload)) {
    return (payload as { type: unknown }).type;
  }
  return payload;
}

function unwrapImportDeclPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if ('import' in payload && !('kind' in payload)) {
    return (payload as { import: unknown }).import;
  }
  return payload;
}

const TypeDefAliasSchema = {
  type: z.unknown().optional(),
  kind: z.enum(['object', 'enum', 'discriminatedUnion', 'raw']).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(z.unknown()).optional(),
  table: z.boolean().optional(),
  tableName: z.string().optional(),
  indexes: z.array(z.unknown()).optional(),
  searchIndexes: z.array(z.unknown()).optional(),
  extends: z.array(z.string()).optional(),
  invariants: z.array(z.unknown()).optional(),
  values: z.array(z.unknown()).optional(),
  discriminator: z.string().optional(),
  variants: z.array(z.unknown()).optional(),
  zod: z.string().optional(),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
  import: z.unknown().optional(),
  sampleData: z.unknown().optional(),
};

// ---- IR meta-schema checks for type-level payloads ---------------------

const TypeDefItemSchema = IRSchemaObject.shape.types.element;
const ImportDeclItemSchema = (
  IRSchemaObject.shape.imports as z.ZodOptional<z.ZodArray<z.ZodType>>
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

function assertOp(value: Op, opName: string): void {
  const res = OpSchema.safeParse(value);
  if (!res.success) {
    throw new Error(
      `${opName}: payload is not a valid Op — ${res.error.issues
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
          serverDerived: z.boolean().optional(),
          derivation: FieldDefSchema.shape.derivation,
        }),
      },
      ({ typeName, fieldName, patch }) => ({ kind: 'update_field', typeName, fieldName, patch }),
      forward,
    ),
    strictTool(
      'remove_field',
      'Remove a field by name.',
      { typeName: z.string().min(1), fieldName: z.string().min(1) },
      ({ typeName, fieldName }) => ({ kind: 'remove_field', typeName, fieldName }),
      forward,
    ),
    strictTool(
      'add_invariant',
      'Add an object-level invariant such as requiresWhen, exactlyOneOf, mutuallyExclusive, fieldPredicate, or uniqueInArray.',
      {
        typeName: z.string().min(1),
        invariant: ObjectInvariantSchema,
        index: z.number().int().optional(),
      },
      ({ typeName, invariant, index }) => ({
        kind: 'add_invariant',
        typeName,
        invariant,
        index,
      }),
      forward,
    ),
    strictTool(
      'update_invariant',
      'Update an object-level invariant by name.',
      {
        typeName: z.string().min(1),
        name: z.string().min(1),
        patch: z.record(z.string(), z.unknown()),
      },
      ({ typeName, name, patch }) => ({
        kind: 'update_invariant',
        typeName,
        name,
        patch,
      }),
      forward,
    ),
    strictTool(
      'remove_invariant',
      'Remove an object-level invariant by name.',
      { typeName: z.string().min(1), name: z.string().min(1) },
      ({ typeName, name }) => ({ kind: 'remove_invariant', typeName, name }),
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
      'remove_variant',
      'Remove a variant (type name) from a discriminatedUnion.',
      { typeName: z.string().min(1), variant: z.string().min(1) },
      ({ typeName, variant }) => ({ kind: 'remove_variant', typeName, variant }),
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
    strictTool(
      'remove_import_at',
      'Remove an import by schema.imports[] index. Use for duplicate aliases where alias removal would remove too much.',
      { index: z.number().int().nonnegative() },
      ({ index }) => ({ kind: 'remove_import_at', index }),
      forward,
    ),
    strictTool(
      'set_table_flag',
      'Flag or unflag an object type as a Convex table.',
      { typeName: z.string().min(1), table: z.boolean() },
      ({ typeName, table }) => ({ kind: 'set_table_flag', typeName, table }),
      forward,
    ),
    strictTool(
      'add_index',
      'Add a named index to a table-flagged object type.',
      {
        typeName: z.string().min(1),
        index: z.object({
          name: z.string().min(1),
          fields: z.array(z.string().min(1)).min(1),
        }),
      },
      ({ typeName, index }) => ({ kind: 'add_index', typeName, index }),
      forward,
    ),
    strictTool(
      'remove_index',
      'Remove an index from an object type by index name.',
      { typeName: z.string().min(1), name: z.string().min(1) },
      ({ typeName, name }) => ({ kind: 'remove_index', typeName, name }),
      forward,
    ),
    strictTool(
      'update_index',
      'Update an index name and/or fields on an object type.',
      {
        typeName: z.string().min(1),
        name: z.string().min(1),
        patch: z.object({
          name: z.string().min(1).optional(),
          fields: z.array(z.string().min(1)).min(1).optional(),
        }),
      },
      ({ typeName, name, patch }) => ({ kind: 'update_index', typeName, name, patch }),
      forward,
    ),
    strictTool(
      'add_search_index',
      'Add a Convex full-text search index to a table-flagged object type.',
      {
        typeName: z.string().min(1),
        searchIndex: z.object({
          name: z.string().min(1),
          searchField: z.string().min(1),
          filterFields: z.array(z.string().min(1)).optional(),
          staged: z.boolean().optional(),
        }),
      },
      ({ typeName, searchIndex }) => ({ kind: 'add_search_index', typeName, searchIndex }),
      forward,
    ),
    strictTool(
      'remove_search_index',
      'Remove a Convex full-text search index from an object type by index name.',
      { typeName: z.string().min(1), name: z.string().min(1) },
      ({ typeName, name }) => ({ kind: 'remove_search_index', typeName, name }),
      forward,
    ),
    strictTool(
      'update_search_index',
      'Update a Convex search index name, search field, filter fields, and staged flag.',
      {
        typeName: z.string().min(1),
        name: z.string().min(1),
        patch: z.object({
          name: z.string().min(1).optional(),
          searchField: z.string().min(1).optional(),
          filterFields: z.array(z.string().min(1)).optional(),
          staged: z.boolean().optional(),
        }),
      },
      ({ typeName, name, patch }) => ({
        kind: 'update_search_index',
        typeName,
        name,
        patch,
      }),
      forward,
    ),
    strictTool(
      'add_value',
      'Add a value to an enum type. Provide typeName (the enum) and value (the new variant string). Optionally include description.',
      {
        typeName: z.string().min(1),
        value: z.string().min(1),
        description: z.string().optional(),
      },
      ({ typeName, value, description }) => ({ kind: 'add_value', typeName, value, description }),
      forward,
    ),
    strictTool(
      'update_value',
      'Update an existing enum value. Provide typeName, the current value string, and a patch with optional new value/description. Note: renaming a value does not migrate runtime data.',
      {
        typeName: z.string().min(1),
        value: z.string().min(1),
        patch: z.object({
          value: z.string().min(1).optional(),
          description: z.string().optional(),
        }),
      },
      ({ typeName, value, patch }) => ({ kind: 'update_value', typeName, value, patch }),
      forward,
    ),
    strictTool(
      'remove_value',
      'Remove a single value from an enum type by its string.',
      { typeName: z.string().min(1), value: z.string().min(1) },
      ({ typeName, value }) => ({ kind: 'remove_value', typeName, value }),
      forward,
    ),
    // --- Type-level (lenient with meta-schema validation) ---
    lenientTool(
      'add_type',
      'Add a new TypeDef (object | enum | discriminatedUnion | raw). Preferred input: { payload: TypeDef }, for example { payload: { kind: "enum", name: "Status", values: [{ value: "active" }] } }. If you are using apply_contexture_op instead, pass the closed-world op as { kind: "add_type", type: TypeDef }.',
      (payload) => ({
        kind: 'add_type',
        type: unwrapTypeDefPayload(payload) as Op & { kind: 'add_type' } extends {
          type: infer T;
        }
          ? T
          : never,
      }),
      (op) => assertTypeDef((op as Extract<Op, { kind: 'add_type' }>).type, 'add_type'),
      forward,
      TypeDefAliasSchema,
    ),
    flexiblePayloadTool(
      'update_type',
      "Update a TypeDef's top-level properties (excluding kind/name).",
      { name: z.string().min(1).optional(), patch: z.record(z.string(), z.unknown()).optional() },
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
      (op) => assertOp(op, 'update_type'),
      forward,
    ),
    flexiblePayloadTool(
      'rename_type',
      'Rename a TypeDef; refs and layout keys cascade.',
      { from: z.string().min(1).optional(), to: z.string().min(1).optional() },
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
    flexiblePayloadTool(
      'delete_type',
      'Delete a TypeDef by name.',
      { name: z.string().min(1).optional() },
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
      'Add an import declaration (stdlib or relative). For stdlib ' +
        'imports the alias MUST equal the namespace ' +
        '(e.g. { kind: "stdlib", path: "@contexture/place", alias: "place" }). ' +
        'Note: stdlib imports are NOT required for refs to resolve — ' +
        'qualified refs like "place.CountryCode" are auto-imported by ' +
        'the emitter. Only call add_import for relative imports of ' +
        'sibling .contexture.json files, or when you specifically want ' +
        'a stdlib namespace listed in schema.imports[].',
      (payload) => ({
        kind: 'add_import',
        import: unwrapImportDeclPayload(payload) as Extract<Op, { kind: 'add_import' }>['import'],
      }),
      (op) => assertImportDecl((op as Extract<Op, { kind: 'add_import' }>).import, 'add_import'),
      forward,
      { import: z.unknown().optional(), kind: z.enum(['stdlib', 'relative']).optional() },
    ),
    // --- Full IR escape hatch ---
    {
      name: 'replace_schema',
      description: 'Bulk rewrite: replace the entire IR. Use only when surgical ops are awkward.',
      inputSchema: {
        schema: z.unknown().optional(),
        payload: z.unknown().optional(),
        version: z.literal('1').optional(),
        types: z.array(z.unknown()).optional(),
        imports: z.array(z.unknown()).optional(),
        layout: z.unknown().optional(),
      },
      handler: async (args) => {
        const rawSchema = 'schema' in args ? args.schema : 'payload' in args ? args.payload : args;
        const schema =
          typeof rawSchema === 'string'
            ? (() => {
                try {
                  return JSON.parse(rawSchema) as unknown;
                } catch {
                  return rawSchema;
                }
              })()
            : rawSchema;
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
