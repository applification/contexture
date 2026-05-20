/**
 * Pure IR → Convex schema source emitter.
 *
 * Turns the IR into the contents of `convex/schema.ts` and
 * `convex/validators.ts`:
 * table-flagged `ObjectTypeDef`s become `defineTable(...)` entries on
 * `defineSchema`; indexes chain on via `.index("name", [fields])`.
 * Non-table object, enum, and discriminated-union types become reusable
 * exported Convex validators.
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
type EnumType = Extract<TypeDef, { kind: 'enum' }>;
type DiscriminatedUnionType = Extract<TypeDef, { kind: 'discriminatedUnion' }>;
type ConvexReusableType = ObjectType | EnumType | DiscriminatedUnionType;

interface RenderContext {
  types: Map<string, TypeDef>;
}

interface RenderOptions {
  preferNamedRefs: boolean;
}

export function emitConvexSchema(schema: Schema, sourcePath?: string): string {
  validateReservedNames(schema);
  const ctx = buildContext(schema);

  const tables = schema.types.filter(
    (t): t is ObjectType => t.kind === 'object' && t.table === true,
  );
  const validatorImports = collectTableValidatorImports(tables, ctx);
  const tableEntries = tables.map((t) => `  ${tableName(t)}: ${renderTable(t, ctx)},`).join('\n');
  const body =
    tableEntries.length > 0
      ? `export default defineSchema({\n${tableEntries}\n});\n`
      : 'export default defineSchema({});\n';

  return [
    banner(sourcePath),
    '',
    `import { defineSchema, defineTable } from 'convex/server';`,
    `import { v } from 'convex/values';`,
    renderValidatorImports(validatorImports),
    '',
    body,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function emitConvexValidators(schema: Schema, sourcePath?: string): string {
  const ctx = buildContext(schema);
  const validators = sortReusableValidators(schema.types.filter(isReusableValidatorType), ctx)
    .map((t) => `export const ${validatorName(t.name)} = ${renderTypeDef(t, ctx)};`)
    .join('\n');

  const body = validators.length > 0 ? `${validators}\n` : '';

  return [banner(sourcePath), '', `import { v } from 'convex/values';`, '', body].join('\n');
}

function buildContext(schema: Schema): RenderContext {
  const typeByName = new Map<string, TypeDef>();
  for (const t of schema.types) {
    typeByName.set(t.name, t);
  }
  return { types: typeByName };
}

function renderTable(t: ObjectType, ctx: RenderContext): string {
  const fields = t.fields
    .map((f) => `    ${f.name}: ${renderFieldDef(f, ctx, { preferNamedRefs: true })},`)
    .join('\n');
  const indexChain = (t.indexes ?? [])
    .map((i) => `.index("${i.name}", [${i.fields.map((f) => `"${f}"`).join(', ')}])`)
    .join('');
  return `defineTable({\n${fields}\n  })${indexChain}`;
}

function renderFieldDef(f: FieldDef, ctx: RenderContext, options: RenderOptions): string {
  let expr = renderType(f.type, ctx, options);
  if (f.nullable) expr = `v.union(${expr}, v.null())`;
  if (f.optional) expr = `v.optional(${expr})`;
  return expr;
}

function renderType(t: FieldType, ctx: RenderContext, options: RenderOptions): string {
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
      const target = ctx.types.get(t.typeName);
      if (!target) {
        // Unknown / qualified ref — fall back to `v.any()` rather than
        // throwing; semantic validation lives elsewhere.
        return 'v.any()';
      }
      if (target.kind === 'raw') return 'v.any()';
      if (target.kind === 'object' && target.table === true) {
        return `v.id("${tableName(target)}")`;
      }
      if (!options.preferNamedRefs) return renderTypeDef(target, ctx);
      return validatorName(target.name);
    }
    case 'array':
      return `v.array(${renderType(t.element, ctx, options)})`;
  }
}

function isReusableValidatorType(t: TypeDef): t is ConvexReusableType {
  return t.kind !== 'raw' && !(t.kind === 'object' && t.table === true);
}

function renderTypeDef(t: ConvexReusableType, ctx: RenderContext): string {
  if (t.kind === 'object') return renderInlineObject(t, ctx, { preferNamedRefs: true });
  if (t.kind === 'enum') return renderEnum(t);
  return renderDiscriminatedUnion(t, ctx);
}

function renderEnum(t: EnumType): string {
  if (t.values.length === 1) {
    const [value] = t.values;
    if (!value) return 'v.any()';
    return `v.literal(${JSON.stringify(value.value)})`;
  }
  return `v.union(${t.values.map((value) => `v.literal(${JSON.stringify(value.value)})`).join(', ')})`;
}

function renderDiscriminatedUnion(t: DiscriminatedUnionType, ctx: RenderContext): string {
  return `v.union(${t.variants.map((name) => renderVariant(name, ctx)).join(', ')})`;
}

function renderVariant(name: string, ctx: RenderContext): string {
  const target = ctx.types.get(name);
  if (!target || target.kind !== 'object') return 'v.any()';
  if (target.table === true) return renderInlineObject(target, ctx, { preferNamedRefs: true });
  return validatorName(target.name);
}

function renderInlineObject(t: ObjectType, ctx: RenderContext, options: RenderOptions): string {
  const fields = t.fields.map((f) => `${f.name}: ${renderFieldDef(f, ctx, options)}`).join(', ');
  return `v.object({ ${fields} })`;
}

function validatorName(name: string): string {
  return lowerFirst(name);
}

function tableName(type: ObjectType): string {
  return type.tableName ?? lowerFirst(type.name);
}

function lowerFirst(name: string): string {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

function sortReusableValidators(
  types: ConvexReusableType[],
  ctx: RenderContext,
): ConvexReusableType[] {
  const reusableByName = new Map(types.map((t) => [t.name, t]));
  const sorted: ConvexReusableType[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  function visit(t: ConvexReusableType): void {
    if (permanent.has(t.name)) return;
    if (temporary.has(t.name)) {
      return;
    }

    temporary.add(t.name);
    for (const depName of reusableDependencyNames(t, ctx)) {
      const dep = reusableByName.get(depName);
      if (dep) visit(dep);
    }
    temporary.delete(t.name);
    permanent.add(t.name);
    sorted.push(t);
  }

  for (const type of types) visit(type);
  return sorted;
}

function reusableDependencyNames(t: ConvexReusableType, ctx: RenderContext): string[] {
  const dependencies = new Set<string>();

  if (t.kind === 'object') {
    for (const field of t.fields) {
      collectReusableDependenciesForType(field.type, ctx, dependencies);
    }
  }

  if (t.kind === 'discriminatedUnion') {
    for (const variantName of t.variants) {
      const variant = ctx.types.get(variantName);
      if (variant && isReusableValidatorType(variant)) dependencies.add(variant.name);
    }
  }

  dependencies.delete(t.name);
  return [...dependencies].sort();
}

function collectReusableDependenciesForType(
  t: FieldType,
  ctx: RenderContext,
  dependencies: Set<string>,
): void {
  if (t.kind === 'array') {
    collectReusableDependenciesForType(t.element, ctx, dependencies);
    return;
  }
  if (t.kind !== 'ref') return;
  const target = ctx.types.get(t.typeName);
  if (!target || !isReusableValidatorType(target)) return;
  dependencies.add(target.name);
}

function collectTableValidatorImports(tables: ObjectType[], ctx: RenderContext): string[] {
  const imports = new Set<string>();
  for (const table of tables) {
    for (const field of table.fields) {
      collectValidatorImportsForType(field.type, ctx, imports);
    }
  }
  return [...imports].sort();
}

function collectValidatorImportsForType(
  t: FieldType,
  ctx: RenderContext,
  imports: Set<string>,
): void {
  if (t.kind === 'array') {
    collectValidatorImportsForType(t.element, ctx, imports);
    return;
  }
  if (t.kind !== 'ref') return;
  const target = ctx.types.get(t.typeName);
  if (!target || !isReusableValidatorType(target)) return;
  imports.add(validatorName(target.name));
}

function renderValidatorImports(names: string[]): string | null {
  if (names.length === 0) return null;
  return `import { ${names.join(', ')} } from './validators';`;
}

function validateReservedNames(schema: Schema): void {
  for (const t of schema.types) {
    if (t.kind !== 'object') continue;
    if (t.table !== true) continue;
    const emittedTableName = tableName(t);
    if (emittedTableName.startsWith('_')) {
      throw new Error(
        `emitConvexSchema: table name "${emittedTableName}" is invalid — Convex reserves names starting with "_"`,
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
