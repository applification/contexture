/**
 * Ops applier — the shared reducer for mutating the Contexture IR.
 *
 * Each op is a small declarative mutation (`add_type`, `rename_type`, …)
 * that the chat channel (via IPC) and direct-manipulation UI both dispatch
 * through `apply(schema, op)`. The reducer is pure: it returns either a
 * fresh `schema` or an `error` record explaining why the op could not be
 * applied. Callers (store, undo stack, MCP tool wrappers) decide what to do
 * with the result.
 *
 * Design notes:
 *   - Every op mutates at most one well-defined region, except for atomic
 *     relationship-preserving ops. `rename_type` cascades through all local
 *     refs and discriminated-union variants; `set_discriminator` cascades the
 *     discriminator field name across the union's local object variants.
 *     Qualified refs (`alias.Name`) are left alone — they point at external
 *     modules.
 *   - `replace_schema` runs the Zod meta-schema so obviously broken inputs
 *     are caught here. A delta semantic check gates *every* op — including
 *     `replace_schema` — so callers cannot land an IR that introduces new
 *     semantic issues. A `StdlibCatalog` enriches the gate with bundled
 *     stdlib namespace awareness when the caller has one.
 */

import { type ZodError, z } from 'zod';
import type { EvolutionPolicy } from './evolution-policy';
import type {
  FieldDef,
  FieldType,
  ImportDecl,
  IndexDef,
  ObjectInvariant,
  Schema,
  SearchIndexDef,
  TypeDef,
} from './ir';
import {
  EvolutionPolicySchema,
  FieldDefSchema,
  IndexDefSchema,
  IRSchema,
  IRSchemaObject,
  ObjectInvariantSchema,
  SearchIndexDefSchema,
  TypeDefSchema,
} from './ir';
import {
  checkSemantic,
  newIssues,
  type SemanticIssue,
  type StdlibCatalog,
} from './semantic-validation';

export type TypeUpdatePatch = TypeDef extends infer T
  ? T extends TypeDef
    ? Partial<Omit<T, 'kind' | 'name'>>
    : never
  : never;

export type Op =
  | { kind: 'set_evolution_policy'; policy: EvolutionPolicy }
  | { kind: 'add_type'; type: TypeDef }
  | { kind: 'update_type'; name: string; patch: TypeUpdatePatch }
  | { kind: 'rename_type'; from: string; to: string }
  | { kind: 'delete_type'; name: string }
  | { kind: 'add_field'; typeName: string; field: FieldDef; index?: number }
  | { kind: 'update_field'; typeName: string; fieldName: string; patch: Partial<FieldDef> }
  | { kind: 'remove_field'; typeName: string; fieldName: string }
  | { kind: 'add_invariant'; typeName: string; invariant: ObjectInvariant; index?: number }
  | {
      kind: 'update_invariant';
      typeName: string;
      name: string;
      patch: Partial<ObjectInvariant>;
    }
  | { kind: 'remove_invariant'; typeName: string; name: string }
  | { kind: 'add_value'; typeName: string; value: string; description?: string }
  | {
      kind: 'update_value';
      typeName: string;
      value: string;
      patch: { value?: string; description?: string };
    }
  | { kind: 'remove_value'; typeName: string; value: string }
  | { kind: 'reorder_fields'; typeName: string; order: string[] }
  | { kind: 'add_variant'; typeName: string; variant: string }
  | { kind: 'remove_variant'; typeName: string; variant: string }
  | { kind: 'set_discriminator'; typeName: string; discriminator: string }
  | { kind: 'add_import'; import: ImportDecl }
  | { kind: 'remove_import'; alias: string }
  | { kind: 'remove_import_at'; index: number }
  | { kind: 'set_table_flag'; typeName: string; table: boolean }
  | { kind: 'add_index'; typeName: string; index: IndexDef }
  | { kind: 'remove_index'; typeName: string; name: string }
  | { kind: 'update_index'; typeName: string; name: string; patch: Partial<IndexDef> }
  | { kind: 'add_search_index'; typeName: string; searchIndex: SearchIndexDef }
  | { kind: 'remove_search_index'; typeName: string; name: string }
  | {
      kind: 'update_search_index';
      typeName: string;
      name: string;
      patch: Partial<SearchIndexDef>;
    }
  | { kind: 'replace_schema'; schema: unknown };

export type ApplyResult = { schema: Schema } | { error: string };

const ImportDeclItemSchema = (
  IRSchemaObject.shape.imports as z.ZodOptional<z.ZodArray<z.ZodType>>
).unwrap().element;

const TypeUpdatePatchSchema = z.record(z.string(), z.unknown()).superRefine((patch, ctx) => {
  for (const forbidden of ['kind', 'name']) {
    if (Object.hasOwn(patch, forbidden)) {
      ctx.addIssue({
        code: 'custom',
        path: [forbidden],
        message: `update_type.patch must not include "${forbidden}"; use ${
          forbidden === 'name' ? 'rename_type' : 'replace_schema'
        } instead.`,
      });
    }
  }
});

export const OpSchema: z.ZodType<Op> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set_evolution_policy'), policy: EvolutionPolicySchema }),
  z.object({ kind: z.literal('add_type'), type: TypeDefSchema }),
  z.object({
    kind: z.literal('update_type'),
    name: z.string().min(1),
    patch: TypeUpdatePatchSchema,
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
    kind: z.literal('add_invariant'),
    typeName: z.string().min(1),
    invariant: ObjectInvariantSchema,
    index: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('update_invariant'),
    typeName: z.string().min(1),
    name: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal('remove_invariant'),
    typeName: z.string().min(1),
    name: z.string().min(1),
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
    kind: z.literal('remove_variant'),
    typeName: z.string().min(1),
    variant: z.string().min(1),
  }),
  z.object({
    kind: z.literal('set_discriminator'),
    typeName: z.string().min(1),
    discriminator: z.string().min(1),
  }),
  z.object({ kind: z.literal('add_import'), import: ImportDeclItemSchema }),
  z.object({ kind: z.literal('remove_import'), alias: z.string().min(1) }),
  z.object({ kind: z.literal('remove_import_at'), index: z.number().int().nonnegative() }),
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
  z.object({
    kind: z.literal('add_search_index'),
    typeName: z.string().min(1),
    searchIndex: SearchIndexDefSchema,
  }),
  z.object({
    kind: z.literal('remove_search_index'),
    typeName: z.string().min(1),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal('update_search_index'),
    typeName: z.string().min(1),
    name: z.string().min(1),
    patch: SearchIndexDefSchema.partial(),
  }),
  z.object({ kind: z.literal('replace_schema'), schema: IRSchema }),
]) as z.ZodType<Op>;

/**
 * Apply an `Op` to `schema` and return the next schema or a structured
 * error.
 *
 * The result is gated by a *delta* semantic check: any newly introduced
 * issue rejects the op with a chat-friendly error (including the `hint`
 * text from `checkSemantic`). Issues that already existed in `schema` are
 * not blamed on the new op — the chat can fix them incrementally without
 * the gate getting in the way.
 */
export function apply(schema: Schema, op: Op, catalog?: StdlibCatalog): ApplyResult {
  const parsedOp = OpSchema.safeParse(op);
  if (!parsedOp.success) {
    return { error: formatStructuralErrors(opKind(op), parsedOp.error) };
  }

  let result: ApplyResult;
  try {
    result = applyStructural(schema, parsedOp.data);
  } catch (err) {
    return { error: `${opKind(op)}: ${err instanceof Error ? err.message : String(err)}` };
  }
  if ('error' in result) return result;
  const structural = IRSchema.safeParse(result.schema);
  if (!structural.success) {
    return { error: formatStructuralErrors(op.kind, structural.error) };
  }
  const introduced = newIssues(
    checkSemantic(schema, catalog),
    checkSemantic(structural.data, catalog),
  ).filter((issue) => issue.severity === 'error');
  if (introduced.length === 0) return { schema: structural.data };
  return { error: formatSemanticErrors(op.kind, introduced) };
}

function opKind(op: unknown): string {
  if (op && typeof op === 'object' && 'kind' in op && typeof op.kind === 'string') {
    return op.kind;
  }
  return 'unknown op';
}

function formatStructuralErrors(opKind: string, error: ZodError): string {
  const lines = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.join('.') || '(root)';
    return `  - ${path}: ${issue.message}`;
  });
  const suffix =
    error.issues.length > lines.length
      ? `  - ...and ${error.issues.length - lines.length} more`
      : null;
  return [
    `${opKind}: would produce an invalid Contexture IR:`,
    ...lines,
    ...(suffix ? [suffix] : []),
  ].join('\n');
}

function formatSemanticErrors(opKind: string, issues: SemanticIssue[]): string {
  const lines = issues.map((i) => {
    const hint = i.hint ? ` ${i.hint}` : '';
    return `  - ${i.path}: ${i.message}${hint}`;
  });
  const lead =
    issues.length === 1
      ? `${opKind}: would introduce 1 semantic issue:`
      : `${opKind}: would introduce ${issues.length} semantic issues:`;
  return [lead, ...lines].join('\n');
}

function applyStructural(schema: Schema, op: Op): ApplyResult {
  switch (op.kind) {
    case 'set_evolution_policy':
      return setEvolutionPolicy(schema, op.policy);
    case 'add_type':
      return addType(schema, op.type);
    case 'update_type':
      return updateType(schema, op.name, op.patch);
    case 'rename_type':
      return renameType(schema, op.from, op.to);
    case 'delete_type':
      return deleteType(schema, op.name);
    case 'add_field':
      return addField(schema, op.typeName, op.field, op.index);
    case 'update_field':
      return updateField(schema, op.typeName, op.fieldName, op.patch);
    case 'remove_field':
      return removeField(schema, op.typeName, op.fieldName);
    case 'add_invariant':
      return addInvariant(schema, op.typeName, op.invariant, op.index);
    case 'update_invariant':
      return updateInvariant(schema, op.typeName, op.name, op.patch);
    case 'remove_invariant':
      return removeInvariant(schema, op.typeName, op.name);
    case 'add_value':
      return addValue(schema, op.typeName, op.value, op.description);
    case 'update_value':
      return updateValue(schema, op.typeName, op.value, op.patch);
    case 'remove_value':
      return removeValue(schema, op.typeName, op.value);
    case 'reorder_fields':
      return reorderFields(schema, op.typeName, op.order);
    case 'add_variant':
      return addVariant(schema, op.typeName, op.variant);
    case 'remove_variant':
      return removeVariant(schema, op.typeName, op.variant);
    case 'set_discriminator':
      return setDiscriminator(schema, op.typeName, op.discriminator);
    case 'add_import':
      return addImport(schema, op.import);
    case 'remove_import':
      return removeImport(schema, op.alias);
    case 'remove_import_at':
      return removeImportAt(schema, op.index);
    case 'set_table_flag':
      return setTableFlag(schema, op.typeName, op.table);
    case 'add_index':
      return addIndex(schema, op.typeName, op.index);
    case 'remove_index':
      return removeIndex(schema, op.typeName, op.name);
    case 'update_index':
      return updateIndex(schema, op.typeName, op.name, op.patch);
    case 'add_search_index':
      return addSearchIndex(schema, op.typeName, op.searchIndex);
    case 'remove_search_index':
      return removeSearchIndex(schema, op.typeName, op.name);
    case 'update_search_index':
      return updateSearchIndex(schema, op.typeName, op.name, op.patch);
    case 'replace_schema':
      return replaceSchema(op.schema);
    default:
      return { error: `unknown op: ${(op as { kind: string }).kind}` };
  }
}

function setEvolutionPolicy(schema: Schema, policy: EvolutionPolicy): ApplyResult {
  return { schema: { ...schema, metadata: { ...schema.metadata, evolutionPolicy: policy } } };
}

// ── types ────────────────────────────────────────────────────────────────

function addType(schema: Schema, type: TypeDef): ApplyResult {
  if (schema.types.some((t) => t.name === type.name)) {
    return { error: `type "${type.name}" already exists` };
  }
  return { schema: { ...schema, types: [...schema.types, type] } };
}

function updateType(
  schema: Schema,
  name: string,
  patch: Partial<Omit<TypeDef, 'kind' | 'name'>>,
): ApplyResult {
  const idx = schema.types.findIndex((t) => t.name === name);
  if (idx === -1) return { error: `type "${name}" not found` };
  const next = { ...schema.types[idx], ...patch } as TypeDef;
  const types = [...schema.types];
  types[idx] = next;
  return { schema: { ...schema, types } };
}

function renameType(schema: Schema, from: string, to: string): ApplyResult {
  if (from === to) return { schema };
  if (!schema.types.some((t) => t.name === from)) {
    return { error: `type "${from}" not found` };
  }
  if (schema.types.some((t) => t.name === to)) {
    return { error: `type "${to}" already exists` };
  }

  const renameFieldType = (t: FieldType): FieldType => {
    if (t.kind === 'ref' && t.typeName === from) return { ...t, typeName: to };
    if (t.kind === 'array') return { ...t, element: renameFieldType(t.element) };
    return t;
  };

  const types = schema.types.map((type): TypeDef => {
    const renamed = type.name === from ? { ...type, name: to } : type;
    if (renamed.kind === 'object') {
      return {
        ...renamed,
        extends: renamed.extends?.map((name) => (name === from ? to : name)),
        fields: renamed.fields.map((f) => ({ ...f, type: renameFieldType(f.type) })),
      };
    }
    if (renamed.kind === 'discriminatedUnion') {
      return {
        ...renamed,
        variants: renamed.variants.map((v) => (v === from ? to : v)),
      };
    }
    return renamed;
  });

  return { schema: { ...schema, types } };
}

function deleteType(schema: Schema, name: string): ApplyResult {
  if (!schema.types.some((t) => t.name === name)) {
    return { error: `type "${name}" not found` };
  }
  return { schema: { ...schema, types: schema.types.filter((t) => t.name !== name) } };
}

// ── fields ───────────────────────────────────────────────────────────────

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

function withObject(
  schema: Schema,
  typeName: string,
  mutate: (t: ObjectType) => ObjectType | { error: string },
): ApplyResult {
  const idx = schema.types.findIndex((t) => t.name === typeName);
  if (idx === -1) return { error: `type "${typeName}" not found` };
  const target = schema.types[idx];
  if (!target) return { error: `type "${typeName}" not found` };
  if (target.kind !== 'object') return { error: `type "${typeName}" is not an object` };
  const result = mutate(target);
  if ('error' in result) return result;
  const types = [...schema.types];
  types[idx] = result;
  return { schema: { ...schema, types } };
}

function addField(
  schema: Schema,
  typeName: string,
  field: FieldDef,
  index: number | undefined,
): ApplyResult {
  return withObject(schema, typeName, (t) => {
    if (t.fields.some((f) => f.name === field.name)) {
      return { error: `field "${field.name}" already exists on "${typeName}"` };
    }
    const fields = [...t.fields];
    if (index === undefined) fields.push(field);
    else fields.splice(index, 0, field);
    return { ...t, fields };
  });
}

function updateField(
  schema: Schema,
  typeName: string,
  fieldName: string,
  patch: Partial<FieldDef>,
): ApplyResult {
  return withObject(schema, typeName, (t) => {
    const fi = t.fields.findIndex((f) => f.name === fieldName);
    if (fi === -1) return { error: `field "${fieldName}" not found on "${typeName}"` };
    const field = t.fields[fi];
    if (!field) return { error: `field "${fieldName}" not found on "${typeName}"` };
    if (
      patch.name !== undefined &&
      patch.name !== fieldName &&
      t.fields.some((candidate) => candidate.name === patch.name)
    ) {
      return { error: `field "${patch.name}" already exists on "${typeName}"` };
    }
    const fields = [...t.fields];
    fields[fi] = { ...field, ...patch };
    const nextFieldName = patch.name;
    const invariants =
      nextFieldName && nextFieldName !== fieldName
        ? t.invariants?.map((invariant) =>
            renameInvariantField(invariant, fieldName, nextFieldName),
          )
        : t.invariants;
    const indexes =
      nextFieldName && nextFieldName !== fieldName
        ? t.indexes?.map((index) => ({
            ...index,
            fields: index.fields.map((name) => (name === fieldName ? nextFieldName : name)),
          }))
        : t.indexes;
    const searchIndexes =
      nextFieldName && nextFieldName !== fieldName
        ? t.searchIndexes?.map((index) => ({
            ...index,
            searchField: index.searchField === fieldName ? nextFieldName : index.searchField,
            filterFields: index.filterFields?.map((name) =>
              name === fieldName ? nextFieldName : name,
            ),
          }))
        : t.searchIndexes;
    return { ...t, fields, indexes, searchIndexes, invariants };
  });
}

function removeField(schema: Schema, typeName: string, fieldName: string): ApplyResult {
  return withObject(schema, typeName, (t) => {
    if (!t.fields.some((f) => f.name === fieldName)) {
      return { error: `field "${fieldName}" not found on "${typeName}"` };
    }
    const indexes = (t.indexes ?? [])
      .map((index) => ({
        ...index,
        fields: index.fields.filter((field) => field !== fieldName),
      }))
      .filter((index) => index.fields.length > 0);
    const searchIndexes = (t.searchIndexes ?? [])
      .filter((index) => index.searchField !== fieldName)
      .map((index) => ({
        ...index,
        filterFields: index.filterFields?.filter((field) => field !== fieldName),
      }));
    return {
      ...t,
      fields: t.fields.filter((f) => f.name !== fieldName),
      invariants: t.invariants?.map((invariant) => removeInvariantField(invariant, fieldName)),
      indexes: indexes.length > 0 ? indexes : undefined,
      searchIndexes: searchIndexes.length > 0 ? searchIndexes : undefined,
    };
  });
}

function reorderFields(schema: Schema, typeName: string, order: string[]): ApplyResult {
  return withObject(schema, typeName, (t) => {
    if (order.length !== t.fields.length) {
      return { error: `reorder_fields: order length mismatch on "${typeName}"` };
    }
    const byName = new Map(t.fields.map((f) => [f.name, f]));
    const next: FieldDef[] = [];
    for (const name of order) {
      const f = byName.get(name);
      if (!f) return { error: `reorder_fields: unknown field "${name}" on "${typeName}"` };
      next.push(f);
    }
    return { ...t, fields: next };
  });
}

// ── invariants ──────────────────────────────────────────────────────────

function addInvariant(
  schema: Schema,
  typeName: string,
  invariant: ObjectInvariant,
  index: number | undefined,
): ApplyResult {
  return withObject(schema, typeName, (t) => {
    const existing = t.invariants ?? [];
    if (existing.some((candidate) => candidate.name === invariant.name)) {
      return { error: `invariant "${invariant.name}" already exists on "${typeName}"` };
    }
    const invariants = [...existing];
    if (index === undefined) invariants.push(invariant);
    else invariants.splice(index, 0, invariant);
    return { ...t, invariants };
  });
}

function updateInvariant(
  schema: Schema,
  typeName: string,
  name: string,
  patch: Partial<ObjectInvariant>,
): ApplyResult {
  return withObject(schema, typeName, (t) => {
    const existing = t.invariants ?? [];
    const idx = existing.findIndex((candidate) => candidate.name === name);
    if (idx === -1) return { error: `invariant "${name}" not found on "${typeName}"` };
    const invariant = existing[idx];
    if (!invariant) return { error: `invariant "${name}" not found on "${typeName}"` };
    const nextName = patch.name ?? invariant.name;
    if (nextName !== name && existing.some((candidate) => candidate.name === nextName)) {
      return { error: `invariant "${nextName}" already exists on "${typeName}"` };
    }
    const invariants = [...existing];
    invariants[idx] = { ...invariant, ...patch } as ObjectInvariant;
    return { ...t, invariants };
  });
}

function removeInvariant(schema: Schema, typeName: string, name: string): ApplyResult {
  return withObject(schema, typeName, (t) => {
    const existing = t.invariants ?? [];
    if (!existing.some((candidate) => candidate.name === name)) {
      return { error: `invariant "${name}" not found on "${typeName}"` };
    }
    const invariants = existing.filter((candidate) => candidate.name !== name);
    if (invariants.length > 0) return { ...t, invariants };
    const { invariants: _removed, ...rest } = t;
    return rest;
  });
}

function renameInvariantField(
  invariant: ObjectInvariant,
  from: string,
  to: string,
): ObjectInvariant {
  switch (invariant.kind) {
    case 'requiresWhen':
      return {
        ...invariant,
        when: renameConditionField(invariant.when, from, to),
        requires: invariant.requires?.map((field) => (field === from ? to : field)),
        forbids: invariant.forbids?.map((field) => (field === from ? to : field)),
      };
    case 'exactlyOneOf':
    case 'mutuallyExclusive':
      return {
        ...invariant,
        fields: invariant.fields.map((field) => (field === from ? to : field)),
      };
    case 'fieldPredicate':
      return { ...invariant, field: invariant.field === from ? to : invariant.field };
    case 'fieldComparison':
      return {
        ...invariant,
        left: invariant.left === from ? to : invariant.left,
        right: invariant.right === from ? to : invariant.right,
      };
    case 'uniqueInArray':
      return {
        ...invariant,
        arrayField: invariant.arrayField === from ? to : invariant.arrayField,
      };
  }
}

function removeInvariantField(invariant: ObjectInvariant, fieldName: string): ObjectInvariant {
  switch (invariant.kind) {
    case 'requiresWhen':
      return {
        ...invariant,
        requires: invariant.requires?.filter((field) => field !== fieldName),
        forbids: invariant.forbids?.filter((field) => field !== fieldName),
      };
    case 'exactlyOneOf':
    case 'mutuallyExclusive':
      return { ...invariant, fields: invariant.fields.filter((field) => field !== fieldName) };
    case 'fieldComparison':
      return invariant;
    case 'fieldPredicate':
    case 'uniqueInArray':
      return invariant;
  }
}

function renameConditionField(
  condition: { field: string; equals: string | number | boolean },
  from: string,
  to: string,
): { field: string; equals: string | number | boolean } {
  return condition.field === from ? { ...condition, field: to } : condition;
}

// ── enum values ──────────────────────────────────────────────────────────

type EnumType = Extract<TypeDef, { kind: 'enum' }>;

function withEnum(
  schema: Schema,
  typeName: string,
  mutate: (t: EnumType) => EnumType | { error: string },
): ApplyResult {
  const idx = schema.types.findIndex((t) => t.name === typeName);
  if (idx === -1) return { error: `type "${typeName}" not found` };
  const target = schema.types[idx];
  if (!target) return { error: `type "${typeName}" not found` };
  if (target.kind !== 'enum') return { error: `type "${typeName}" is not an enum` };
  const result = mutate(target);
  if ('error' in result) return result;
  const types = [...schema.types];
  types[idx] = result;
  return { schema: { ...schema, types } };
}

function addValue(
  schema: Schema,
  typeName: string,
  value: string,
  description: string | undefined,
): ApplyResult {
  return withEnum(schema, typeName, (t) => {
    if (t.values.some((v) => v.value === value)) {
      return { error: `value "${value}" already exists on "${typeName}"` };
    }
    const entry = description !== undefined ? { value, description } : { value };
    return { ...t, values: [...t.values, entry] };
  });
}

function updateValue(
  schema: Schema,
  typeName: string,
  value: string,
  patch: { value?: string; description?: string },
): ApplyResult {
  return withEnum(schema, typeName, (t) => {
    const vi = t.values.findIndex((v) => v.value === value);
    if (vi === -1) return { error: `value "${value}" not found on "${typeName}"` };
    const entry = t.values[vi];
    if (!entry) return { error: `value "${value}" not found on "${typeName}"` };
    if (
      patch.value !== undefined &&
      patch.value !== value &&
      t.values.some((v) => v.value === patch.value)
    ) {
      return { error: `value "${patch.value}" already exists on "${typeName}"` };
    }
    const values = [...t.values];
    values[vi] = { ...entry, ...patch };
    return { ...t, values };
  });
}

function removeValue(schema: Schema, typeName: string, value: string): ApplyResult {
  return withEnum(schema, typeName, (t) => {
    if (!t.values.some((v) => v.value === value)) {
      return { error: `value "${value}" not found on "${typeName}"` };
    }
    return { ...t, values: t.values.filter((v) => v.value !== value) };
  });
}

// ── tables + indexes ─────────────────────────────────────────────────────

function setTableFlag(schema: Schema, typeName: string, table: boolean): ApplyResult {
  return withObject(schema, typeName, (t) => ({ ...t, table }));
}

function addIndex(schema: Schema, typeName: string, index: IndexDef): ApplyResult {
  return withObject(schema, typeName, (t) => {
    if (index.fields.length === 0) {
      return { error: `add_index: index "${index.name}" must have at least one field` };
    }
    const duplicateField = firstDuplicate(index.fields);
    if (duplicateField) {
      return { error: `add_index: field "${duplicateField}" appears more than once` };
    }
    const existing = t.indexes ?? [];
    if (existing.some((i) => i.name === index.name)) {
      return { error: `index "${index.name}" already exists on "${typeName}"` };
    }
    if ((t.searchIndexes ?? []).some((i) => i.name === index.name)) {
      return {
        error: `index "${index.name}" conflicts with an existing search index on "${typeName}"`,
      };
    }
    const fieldNames = new Set(t.fields.map((f) => f.name));
    for (const f of index.fields) {
      if (!fieldNames.has(f)) {
        return { error: `add_index: unknown field "${f}" on "${typeName}"` };
      }
    }
    return { ...t, indexes: [...existing, index] };
  });
}

function removeIndex(schema: Schema, typeName: string, name: string): ApplyResult {
  return withObject(schema, typeName, (t) => {
    const existing = t.indexes ?? [];
    if (!existing.some((i) => i.name === name)) {
      return { error: `index "${name}" not found on "${typeName}"` };
    }
    return { ...t, indexes: existing.filter((i) => i.name !== name) };
  });
}

function updateIndex(
  schema: Schema,
  typeName: string,
  name: string,
  patch: Partial<IndexDef>,
): ApplyResult {
  return withObject(schema, typeName, (t) => {
    const existing = t.indexes ?? [];
    const idx = existing.findIndex((i) => i.name === name);
    if (idx === -1) return { error: `index "${name}" not found on "${typeName}"` };
    const index = existing[idx];
    if (!index) return { error: `index "${name}" not found on "${typeName}"` };
    const nextName = patch.name ?? index.name;
    const nextFields = patch.fields ?? index.fields;
    if (nextFields.length === 0) {
      return { error: `update_index: index "${name}" must have at least one field` };
    }
    const duplicateField = firstDuplicate(nextFields);
    if (duplicateField) {
      return { error: `update_index: field "${duplicateField}" appears more than once` };
    }
    if (patch.name && patch.name !== name && existing.some((i) => i.name === patch.name)) {
      return { error: `index "${patch.name}" already exists on "${typeName}"` };
    }
    if ((t.searchIndexes ?? []).some((index) => index.name === nextName)) {
      return {
        error: `index "${nextName}" conflicts with an existing search index on "${typeName}"`,
      };
    }
    const fieldNames = new Set(t.fields.map((f) => f.name));
    for (const f of nextFields) {
      if (!fieldNames.has(f)) {
        return { error: `update_index: unknown field "${f}" on "${typeName}"` };
      }
    }
    const indexes = [...existing];
    indexes[idx] = { name: nextName, fields: nextFields };
    return { ...t, indexes };
  });
}

function addSearchIndex(
  schema: Schema,
  typeName: string,
  searchIndex: SearchIndexDef,
): ApplyResult {
  return withObject(schema, typeName, (t) => {
    if (t.table !== true) {
      return { error: `add_search_index: "${typeName}" is not a Convex table` };
    }
    const existing = t.searchIndexes ?? [];
    if (existing.some((index) => index.name === searchIndex.name)) {
      return { error: `search index "${searchIndex.name}" already exists on "${typeName}"` };
    }
    if ((t.indexes ?? []).some((index) => index.name === searchIndex.name)) {
      return {
        error: `search index "${searchIndex.name}" conflicts with an existing index on "${typeName}"`,
      };
    }
    const validation = validateSearchIndexFields(t, searchIndex, 'add_search_index');
    if (validation) return validation;
    return { ...t, searchIndexes: [...existing, searchIndex] };
  });
}

function removeSearchIndex(schema: Schema, typeName: string, name: string): ApplyResult {
  return withObject(schema, typeName, (t) => {
    const existing = t.searchIndexes ?? [];
    if (!existing.some((index) => index.name === name)) {
      return { error: `search index "${name}" not found on "${typeName}"` };
    }
    const searchIndexes = existing.filter((index) => index.name !== name);
    return { ...t, searchIndexes: searchIndexes.length > 0 ? searchIndexes : undefined };
  });
}

function updateSearchIndex(
  schema: Schema,
  typeName: string,
  name: string,
  patch: Partial<SearchIndexDef>,
): ApplyResult {
  return withObject(schema, typeName, (t) => {
    if (t.table !== true) {
      return { error: `update_search_index: "${typeName}" is not a Convex table` };
    }
    const existing = t.searchIndexes ?? [];
    const idx = existing.findIndex((index) => index.name === name);
    if (idx === -1) return { error: `search index "${name}" not found on "${typeName}"` };
    const current = existing[idx];
    if (!current) return { error: `search index "${name}" not found on "${typeName}"` };
    const next: SearchIndexDef = { ...current, ...patch };
    if (patch.name && patch.name !== name && existing.some((index) => index.name === patch.name)) {
      return { error: `search index "${patch.name}" already exists on "${typeName}"` };
    }
    if ((t.indexes ?? []).some((index) => index.name === next.name)) {
      return {
        error: `search index "${next.name}" conflicts with an existing index on "${typeName}"`,
      };
    }
    const validation = validateSearchIndexFields(t, next, 'update_search_index');
    if (validation) return validation;
    const searchIndexes = [...existing];
    searchIndexes[idx] = next;
    return { ...t, searchIndexes };
  });
}

function validateSearchIndexFields(
  type: ObjectType,
  searchIndex: SearchIndexDef,
  opKind: 'add_search_index' | 'update_search_index',
): { error: string } | null {
  const searchField = type.fields.find((field) => field.name === searchIndex.searchField);
  if (!searchField) {
    return {
      error: `${opKind}: unknown search field "${searchIndex.searchField}" on "${type.name}"`,
    };
  }
  if (searchField.type.kind !== 'string') {
    return {
      error: `${opKind}: search field "${searchIndex.searchField}" must be a string field`,
    };
  }
  const duplicateFilterField = firstDuplicate(searchIndex.filterFields ?? []);
  if (duplicateFilterField) {
    return { error: `${opKind}: filter field "${duplicateFilterField}" appears more than once` };
  }
  const fieldNames = new Set(type.fields.map((field) => field.name));
  for (const fieldName of searchIndex.filterFields ?? []) {
    if (!fieldNames.has(fieldName)) {
      return { error: `${opKind}: unknown filter field "${fieldName}" on "${type.name}"` };
    }
  }
  return null;
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

// ── discriminated unions ─────────────────────────────────────────────────

type UnionType = Extract<TypeDef, { kind: 'discriminatedUnion' }>;

function withUnion(
  schema: Schema,
  typeName: string,
  mutate: (t: UnionType) => UnionType | { error: string },
): ApplyResult {
  const idx = schema.types.findIndex((t) => t.name === typeName);
  if (idx === -1) return { error: `type "${typeName}" not found` };
  const target = schema.types[idx];
  if (!target) return { error: `type "${typeName}" not found` };
  if (target.kind !== 'discriminatedUnion') {
    return { error: `type "${typeName}" is not a discriminatedUnion` };
  }
  const result = mutate(target);
  if ('error' in result) return result;
  const types = [...schema.types];
  types[idx] = result;
  return { schema: { ...schema, types } };
}

function addVariant(schema: Schema, typeName: string, variant: string): ApplyResult {
  return withUnion(schema, typeName, (t) => {
    if (t.variants.includes(variant)) {
      return { error: `variant "${variant}" already on "${typeName}"` };
    }
    return { ...t, variants: [...t.variants, variant] };
  });
}

function removeVariant(schema: Schema, typeName: string, variant: string): ApplyResult {
  return withUnion(schema, typeName, (t) => {
    if (!t.variants.includes(variant)) {
      return { error: `variant "${variant}" not found on "${typeName}"` };
    }
    return { ...t, variants: t.variants.filter((candidate) => candidate !== variant) };
  });
}

function setDiscriminator(schema: Schema, typeName: string, discriminator: string): ApplyResult {
  const union = schema.types.find(
    (type): type is UnionType => type.kind === 'discriminatedUnion' && type.name === typeName,
  );
  if (!union) {
    const exists = schema.types.some((type) => type.name === typeName);
    return {
      error: exists
        ? `type "${typeName}" is not a discriminatedUnion`
        : `type "${typeName}" not found`,
    };
  }
  if (union.discriminator === discriminator) return { schema };

  const variantNames = new Set(union.variants);
  const types = schema.types.map((type): TypeDef => {
    if (type.name === typeName) return { ...union, discriminator };
    if (type.kind !== 'object' || !variantNames.has(type.name)) return type;
    if (type.fields.some((field) => field.name === discriminator)) return type;
    if (!type.fields.some((field) => field.name === union.discriminator)) return type;
    return {
      ...type,
      fields: type.fields.map((field) =>
        field.name === union.discriminator ? { ...field, name: discriminator } : field,
      ),
      indexes: type.indexes?.map((index) => ({
        ...index,
        fields: index.fields.map((field) =>
          field === union.discriminator ? discriminator : field,
        ),
      })),
      searchIndexes: type.searchIndexes?.map((index) => ({
        ...index,
        searchField: index.searchField === union.discriminator ? discriminator : index.searchField,
        filterFields: index.filterFields?.map((field) =>
          field === union.discriminator ? discriminator : field,
        ),
      })),
    };
  });

  return { schema: { ...schema, types } };
}

// ── imports ──────────────────────────────────────────────────────────────

function addImport(schema: Schema, imp: ImportDecl): ApplyResult {
  const existing = schema.imports ?? [];
  if (existing.some((i) => i.alias === imp.alias)) {
    return { error: `import alias "${imp.alias}" already exists` };
  }
  return { schema: { ...schema, imports: [...existing, imp] } };
}

function removeImport(schema: Schema, alias: string): ApplyResult {
  const existing = schema.imports ?? [];
  if (!existing.some((i) => i.alias === alias)) {
    return { error: `import alias "${alias}" not found` };
  }
  return { schema: { ...schema, imports: existing.filter((i) => i.alias !== alias) } };
}

function removeImportAt(schema: Schema, index: number): ApplyResult {
  const existing = schema.imports ?? [];
  if (index < 0 || index >= existing.length) {
    return { error: `import at index ${index} not found` };
  }
  const imports = existing.filter((_, candidateIndex) => candidateIndex !== index);
  return { schema: { ...schema, imports: imports.length > 0 ? imports : undefined } };
}

// ── full replace ─────────────────────────────────────────────────────────

function replaceSchema(candidate: unknown): ApplyResult {
  const parsed = IRSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? '';
    return {
      error: `replace_schema: structural validation failed at "${path}": ${first?.message ?? 'invalid'}`,
    };
  }
  return { schema: parsed.data };
}
