/**
 * Pure IR → Convex schema source emitter.
 *
 * Turns the IR into the contents of `convex/schema.ts`:
 * table-flagged `ObjectTypeDef`s become `defineTable(...)` entries on
 * `defineSchema`; indexes chain on via `.index("name", [fields])`.
 * Non-table object types that are referenced via `ref` are inlined as
 * `v.object({...})`.
 *
 * Convex reserves names starting with `_` (including `_id` and
 * `_creationTime`). The emitter is the final backstop for that rule —
 * callers that bypass the UI (chat ops, raw JSON edits) still hit this
 * check before a broken `schema.ts` lands on disk.
 *
 * The function is pure: same IR in, same string out, no I/O.
 */
import type { FieldDef, FieldType, Schema, TypeDef } from './ir';

function banner(sourcePath?: string): string {
  const base = '// @contexture-generated — do not edit by hand. Regenerated on every IR save.';
  return sourcePath ? `${base} Source: ${sourcePath}` : base;
}

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

export function emitConvexSchema(schema: Schema, sourcePath?: string): string {
  validateReservedNames(schema);
  const objectByName = new Map<string, ObjectType>();
  for (const t of schema.types) {
    if (t.kind === 'object') objectByName.set(t.name, t);
  }

  const tables = schema.types.filter(
    (t): t is ObjectType => t.kind === 'object' && t.table === true,
  );

  const tableEntries = tables
    .map((t) => `  ${t.name}: ${renderTable(t, objectByName)},`)
    .join('\n');

  const body =
    tableEntries.length > 0
      ? `export default defineSchema({\n${tableEntries}\n});\n`
      : 'export default defineSchema({});\n';

  return [
    banner(sourcePath),
    '',
    `import { defineSchema, defineTable } from 'convex/server';`,
    `import { v } from 'convex/values';`,
    '',
    body,
  ].join('\n');
}

function renderTable(t: ObjectType, objects: Map<string, ObjectType>): string {
  const fields = t.fields.map((f) => `    ${f.name}: ${renderFieldDef(f, objects)},`).join('\n');
  const indexChain = (t.indexes ?? [])
    .map((i) => `.index("${i.name}", [${i.fields.map((f) => `"${f}"`).join(', ')}])`)
    .join('');
  return `defineTable({\n${fields}\n  })${indexChain}`;
}

function renderFieldDef(f: FieldDef, objects: Map<string, ObjectType>): string {
  let expr = renderType(f.type, objects);
  if (f.nullable) expr = `v.union(${expr}, v.null())`;
  if (f.optional) expr = `v.optional(${expr})`;
  return expr;
}

function renderType(t: FieldType, objects: Map<string, ObjectType>): string {
  switch (t.kind) {
    case 'string':
      return 'v.string()';
    case 'number':
      return 'v.number()';
    case 'boolean':
      return 'v.boolean()';
    case 'date':
      // Convex has no native date validator; epoch ms is the conventional
      // encoding.
      return 'v.number()';
    case 'literal':
      return `v.literal(${JSON.stringify(t.value)})`;
    case 'ref': {
      const target = objects.get(t.typeName);
      if (!target) {
        // Unknown / qualified ref — fall back to `v.any()` rather than
        // throwing; semantic validation lives elsewhere.
        return 'v.any()';
      }
      if (target.table === true) {
        return `v.id("${target.name}")`;
      }
      return renderInlineObject(target, objects);
    }
    case 'array':
      return `v.array(${renderType(t.element, objects)})`;
  }
}

function renderInlineObject(t: ObjectType, objects: Map<string, ObjectType>): string {
  const fields = t.fields.map((f) => `${f.name}: ${renderFieldDef(f, objects)}`).join(', ');
  return `v.object({ ${fields} })`;
}

function validateReservedNames(schema: Schema): void {
  for (const t of schema.types) {
    if (t.kind !== 'object') continue;
    if (t.table !== true) continue;
    if (t.name.startsWith('_')) {
      throw new Error(
        `emitConvexSchema: table name "${t.name}" is invalid — Convex reserves names starting with "_"`,
      );
    }
    for (const f of t.fields) {
      if (f.name.startsWith('_')) {
        throw new Error(
          `emitConvexSchema: field "${t.name}.${f.name}" is invalid — Convex reserves names starting with "_" (including _id, _creationTime)`,
        );
      }
    }
  }
}
