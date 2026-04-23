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
 *   - Every op mutates at most one well-defined region; `rename_type` is the
 *     sole exception because a rename must cascade atomically through all
 *     local refs and discriminated-union variants. Qualified refs
 *     (`alias.Name`) are left alone — they point at external modules.
 *   - `replace_schema` runs the Zod meta-schema so obviously broken inputs
 *     are caught here; semantic rules (unresolved refs, duplicate names)
 *     stay in `services/validation.ts` so the UI can surface them with
 *     field-level paths after the replacement lands.
 */

import type { FieldDef, FieldType, ImportDecl, Schema, TypeDef } from '../model/ir';
import { IRSchema } from '../model/ir';

export type Op =
  | { kind: 'add_type'; type: TypeDef }
  | { kind: 'update_type'; name: string; patch: Partial<Omit<TypeDef, 'kind' | 'name'>> }
  | { kind: 'rename_type'; from: string; to: string }
  | { kind: 'delete_type'; name: string }
  | { kind: 'add_field'; typeName: string; field: FieldDef; index?: number }
  | { kind: 'update_field'; typeName: string; fieldName: string; patch: Partial<FieldDef> }
  | { kind: 'delete_field'; typeName: string; fieldName: string }
  | { kind: 'reorder_fields'; typeName: string; order: string[] }
  | { kind: 'add_variant'; typeName: string; variant: string }
  | { kind: 'set_discriminator'; typeName: string; discriminator: string }
  | { kind: 'add_import'; import: ImportDecl }
  | { kind: 'remove_import'; alias: string }
  | { kind: 'replace_schema'; schema: unknown };

export type ApplyResult = { schema: Schema } | { error: string };

export function apply(schema: Schema, op: Op): ApplyResult {
  switch (op.kind) {
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
    case 'delete_field':
      return deleteField(schema, op.typeName, op.fieldName);
    case 'reorder_fields':
      return reorderFields(schema, op.typeName, op.order);
    case 'add_variant':
      return addVariant(schema, op.typeName, op.variant);
    case 'set_discriminator':
      return setDiscriminator(schema, op.typeName, op.discriminator);
    case 'add_import':
      return addImport(schema, op.import);
    case 'remove_import':
      return removeImport(schema, op.alias);
    case 'replace_schema':
      return replaceSchema(op.schema);
    default:
      return { error: `unknown op: ${(op as { kind: string }).kind}` };
  }
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
    const fields = [...t.fields];
    fields[fi] = { ...fields[fi], ...patch };
    return { ...t, fields };
  });
}

function deleteField(schema: Schema, typeName: string, fieldName: string): ApplyResult {
  return withObject(schema, typeName, (t) => {
    if (!t.fields.some((f) => f.name === fieldName)) {
      return { error: `field "${fieldName}" not found on "${typeName}"` };
    }
    return { ...t, fields: t.fields.filter((f) => f.name !== fieldName) };
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

function setDiscriminator(schema: Schema, typeName: string, discriminator: string): ApplyResult {
  return withUnion(schema, typeName, (t) => ({ ...t, discriminator }));
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
