import type { FieldDef, FieldType, IndexDef, Schema, TypeDef } from '@contexture/core';
import type { Op } from '@contexture/core/ops';
import * as ts from 'typescript';

export interface DeterministicReconcileEntry {
  op: Op;
  label: string;
  lossy: boolean;
  provenance: 'deterministic';
}

export type ConvexSchemaProposalResult =
  | { ok: true; ops: DeterministicReconcileEntry[] }
  | { ok: false; error: string };

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

interface ParsedTable {
  tableName: string;
  fields: FieldDef[];
  indexes: IndexDef[];
}

interface ParseContext {
  typeNameForTableName: Map<string, string>;
}

export function proposeConvexSchemaOps(schema: Schema, source: string): ConvexSchemaProposalResult {
  const tablesByName = tableTypesByConvexName(schema);
  const parsed = parseConvexSchema(source, {
    typeNameForTableName: new Map(
      [...tablesByName].map(([tableName, type]) => [tableName, type.name]),
    ),
  });
  if (!parsed.ok) return parsed;

  const ops: DeterministicReconcileEntry[] = [];

  for (const table of parsed.tables) {
    const existing = tablesByName.get(table.tableName);
    if (!existing) {
      ops.push({
        op: {
          kind: 'add_type',
          type: {
            kind: 'object',
            name: typeNameForTable(table.tableName),
            table: true,
            tableName: table.tableName,
            fields: table.fields,
            ...(table.indexes.length > 0 ? { indexes: table.indexes } : {}),
          },
        },
        label: `Add Convex table "${table.tableName}"`,
        lossy: false,
        provenance: 'deterministic',
      });
      continue;
    }

    addFieldOps(ops, existing, table);
    addIndexOps(ops, existing, table);
  }

  return { ok: true, ops };
}

function addFieldOps(
  ops: DeterministicReconcileEntry[],
  existing: ObjectType,
  table: ParsedTable,
): void {
  const existingFields = new Map(existing.fields.map((field) => [field.name, field]));
  const parsedFieldNames = new Set(table.fields.map((field) => field.name));
  for (const field of table.fields) {
    const prior = existingFields.get(field.name);
    if (!prior) {
      ops.push({
        op: { kind: 'add_field', typeName: existing.name, field },
        label: `Add field "${field.name}" to "${existing.name}"`,
        lossy: false,
        provenance: 'deterministic',
      });
      continue;
    }
    const patch = fieldPatch(prior, field);
    if (Object.keys(patch).length === 0) continue;
    ops.push({
      op: { kind: 'update_field', typeName: existing.name, fieldName: prior.name, patch },
      label: `Update field "${field.name}" on "${existing.name}"`,
      lossy: isLossyFieldChange(prior, field),
      provenance: 'deterministic',
    });
  }
  for (const field of existing.fields) {
    if (parsedFieldNames.has(field.name)) continue;
    ops.push({
      op: { kind: 'remove_field', typeName: existing.name, fieldName: field.name },
      label: `Remove field "${field.name}" from "${existing.name}"`,
      lossy: true,
      provenance: 'deterministic',
    });
  }
}

function addIndexOps(
  ops: DeterministicReconcileEntry[],
  existing: ObjectType,
  table: ParsedTable,
): void {
  const existingIndexes = new Map((existing.indexes ?? []).map((index) => [index.name, index]));
  const parsedIndexNames = new Set(table.indexes.map((index) => index.name));
  for (const index of table.indexes) {
    const prior = existingIndexes.get(index.name);
    if (!prior) {
      ops.push({
        op: { kind: 'add_index', typeName: existing.name, index },
        label: `Add index "${index.name}" to "${existing.name}"`,
        lossy: false,
        provenance: 'deterministic',
      });
      continue;
    }
    if (sameStringArray(prior.fields, index.fields)) continue;
    ops.push({
      op: {
        kind: 'update_index',
        typeName: existing.name,
        name: prior.name,
        patch: { fields: index.fields },
      },
      label: `Update index "${index.name}" on "${existing.name}"`,
      lossy: false,
      provenance: 'deterministic',
    });
  }
  for (const index of existing.indexes ?? []) {
    if (parsedIndexNames.has(index.name)) continue;
    ops.push({
      op: { kind: 'remove_index', typeName: existing.name, name: index.name },
      label: `Remove index "${index.name}" from "${existing.name}"`,
      lossy: false,
      provenance: 'deterministic',
    });
  }
}

function parseConvexSchema(
  source: string,
  ctx: ParseContext,
): { ok: true; tables: ParsedTable[] } | { ok: false; error: string } {
  const sf = ts.createSourceFile(
    'schema.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics = (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length > 0) {
    return { ok: false, error: 'convex/schema.ts is not valid TypeScript.' };
  }

  const schemaCall = findDefaultDefineSchemaCall(sf);
  if (!schemaCall) {
    return { ok: false, error: 'Could not find `export default defineSchema({ ... })`.' };
  }
  const [tablesArg] = schemaCall.arguments;
  if (!tablesArg || !ts.isObjectLiteralExpression(tablesArg)) {
    return { ok: false, error: '`defineSchema` must receive an object literal.' };
  }

  const tables: ParsedTable[] = [];
  for (const prop of tablesArg.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      return { ok: false, error: 'Only table property assignments are supported.' };
    }
    const tableName = propertyNameText(prop.name);
    if (!tableName) return { ok: false, error: 'Only literal Convex table names are supported.' };
    const table = parseTableExpression(tableName, prop.initializer, ctx);
    if (!table.ok) return table;
    tables.push(table.table);
  }

  return { ok: true, tables };
}

function findDefaultDefineSchemaCall(sf: ts.SourceFile): ts.CallExpression | null {
  for (const statement of sf.statements) {
    if (!ts.isExportAssignment(statement)) continue;
    const expr = statement.expression;
    if (!ts.isCallExpression(expr)) continue;
    if (identifierText(expr.expression) !== 'defineSchema') continue;
    return expr;
  }
  return null;
}

function parseTableExpression(
  tableName: string,
  expr: ts.Expression,
  ctx: ParseContext,
): { ok: true; table: ParsedTable } | { ok: false; error: string } {
  const indexes: IndexDef[] = [];
  let current = expr;

  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const access = current.expression;
    if (access.name.text !== 'index') {
      return { ok: false, error: 'Only `.index(...)` chains are supported on tables.' };
    }
    const index = parseIndexCall(current);
    if (!index.ok) return index;
    indexes.unshift(index.index);
    current = access.expression;
  }

  if (!ts.isCallExpression(current) || identifierText(current.expression) !== 'defineTable') {
    return { ok: false, error: `Table "${tableName}" must be a defineTable(...) expression.` };
  }
  const [fieldsArg] = current.arguments;
  if (!fieldsArg || !ts.isObjectLiteralExpression(fieldsArg)) {
    return { ok: false, error: `Table "${tableName}" must define fields with an object literal.` };
  }
  const fields = parseFields(fieldsArg, ctx);
  if (!fields.ok) return fields;
  return { ok: true, table: { tableName, fields: fields.fields, indexes } };
}

function parseFields(
  object: ts.ObjectLiteralExpression,
  ctx: ParseContext,
): { ok: true; fields: FieldDef[] } | { ok: false; error: string } {
  const fields: FieldDef[] = [];
  for (const prop of object.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      return { ok: false, error: 'Only field property assignments are supported.' };
    }
    const name = propertyNameText(prop.name);
    if (!name) return { ok: false, error: 'Only literal field names are supported.' };
    const parsed = parseFieldType(prop.initializer, ctx);
    if (!parsed.ok) return parsed;
    fields.push({ name, ...parsed.field });
  }
  return { ok: true, fields };
}

function parseFieldType(
  expr: ts.Expression,
  ctx: ParseContext,
): { ok: true; field: Omit<FieldDef, 'name'> } | { ok: false; error: string } {
  if (ts.isCallExpression(expr) && propertyAccessName(expr.expression) === 'optional') {
    const inner = onlyArgument(expr, 'v.optional');
    if (!inner.ok) return inner;
    const parsed = parseFieldType(inner.expr, ctx);
    if (!parsed.ok) return parsed;
    return { ok: true, field: { ...parsed.field, optional: true } };
  }

  if (ts.isCallExpression(expr) && propertyAccessName(expr.expression) === 'union') {
    const args = [...expr.arguments];
    const nullIndex = args.findIndex(isVNullCall);
    if (nullIndex !== -1 && args.length === 2) {
      const inner = args[nullIndex === 0 ? 1 : 0];
      if (!inner) return { ok: false, error: 'Unsupported nullable union shape.' };
      const parsed = parseFieldType(inner, ctx);
      if (!parsed.ok) return parsed;
      return { ok: true, field: { ...parsed.field, nullable: true } };
    }
    return { ok: false, error: 'Only nullable `v.union(type, v.null())` is supported.' };
  }

  const type = parseBareFieldType(expr, ctx);
  if (!type.ok) return type;
  return { ok: true, field: { type: type.type } };
}

function parseBareFieldType(
  expr: ts.Expression,
  ctx: ParseContext,
): { ok: true; type: FieldType } | { ok: false; error: string } {
  if (!ts.isCallExpression(expr)) {
    if (ts.isIdentifier(expr)) {
      return { ok: true, type: { kind: 'ref', typeName: typeNameForValidator(expr.text) } };
    }
    return { ok: false, error: 'Only Convex `v.*` validators are supported.' };
  }

  const name = propertyAccessName(expr.expression);
  switch (name) {
    case 'string':
      return { ok: true, type: { kind: 'string' } };
    case 'number':
    case 'float64':
    case 'int64':
      return { ok: true, type: { kind: 'number' } };
    case 'boolean':
      return { ok: true, type: { kind: 'boolean' } };
    case 'literal': {
      const [value] = expr.arguments;
      const literal = literalValue(value);
      if (literal === null) {
        return { ok: false, error: 'Only string, number, and boolean literals are supported.' };
      }
      return { ok: true, type: { kind: 'literal', value: literal } };
    }
    case 'id': {
      const [tableName] = expr.arguments;
      if (!tableName || !ts.isStringLiteral(tableName)) {
        return { ok: false, error: '`v.id(...)` must use a string literal table name.' };
      }
      return {
        ok: true,
        type: {
          kind: 'ref',
          typeName:
            ctx.typeNameForTableName.get(tableName.text) ?? typeNameForTable(tableName.text),
        },
      };
    }
    case 'array': {
      const inner = onlyArgument(expr, 'v.array');
      if (!inner.ok) return inner;
      const parsed = parseBareFieldType(inner.expr, ctx);
      if (!parsed.ok) return parsed;
      return { ok: true, type: { kind: 'array', element: parsed.type } };
    }
    default:
      if (ts.isIdentifier(expr.expression)) {
        return {
          ok: true,
          type: { kind: 'ref', typeName: typeNameForValidator(expr.expression.text) },
        };
      }
      return { ok: false, error: `Unsupported Convex validator "${name ?? '<unknown>'}".` };
  }
}

function parseIndexCall(
  call: ts.CallExpression,
): { ok: true; index: IndexDef } | { ok: false; error: string } {
  const [nameArg, fieldsArg] = call.arguments;
  if (!nameArg || !ts.isStringLiteral(nameArg)) {
    return { ok: false, error: 'Index names must be string literals.' };
  }
  const fields = parseStringArray(fieldsArg);
  if (!fields.ok) return fields;
  return { ok: true, index: { name: nameArg.text, fields: fields.values } };
}

function onlyArgument(
  call: ts.CallExpression,
  label: string,
): { ok: true; expr: ts.Expression } | { ok: false; error: string } {
  const [expr] = call.arguments;
  if (!expr || call.arguments.length !== 1) {
    return { ok: false, error: `${label} must have exactly one argument.` };
  }
  return { ok: true, expr };
}

function isVNullCall(expr: ts.Expression): boolean {
  return ts.isCallExpression(expr) && propertyAccessName(expr.expression) === 'null';
}

function parseStringArray(
  expr: ts.Expression | undefined,
): { ok: true; values: string[] } | { ok: false; error: string } {
  if (!expr || !ts.isArrayLiteralExpression(expr)) {
    return { ok: false, error: 'Index fields must be an array literal.' };
  }
  const values: string[] = [];
  for (const element of expr.elements) {
    if (!ts.isStringLiteral(element)) {
      return { ok: false, error: 'Index fields must be string literals.' };
    }
    values.push(element.text);
  }
  if (values.length === 0) return { ok: false, error: 'Indexes must include at least one field.' };
  return { ok: true, values };
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function propertyAccessName(expr: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expr)) return null;
  if (identifierText(expr.expression) !== 'v') return null;
  return expr.name.text;
}

function identifierText(expr: ts.Expression): string | null {
  return ts.isIdentifier(expr) ? expr.text : null;
}

function literalValue(expr: ts.Expression | undefined): string | number | boolean | null {
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNumericLiteral(expr)) {
    return ts.isNumericLiteral(expr) ? Number(expr.text) : expr.text;
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
  return null;
}

function tableTypesByConvexName(schema: Schema): Map<string, ObjectType> {
  const tables = new Map<string, ObjectType>();
  for (const type of schema.types) {
    if (type.kind !== 'object' || type.table !== true) continue;
    tables.set(type.tableName ?? lowerFirst(type.name), type);
  }
  return tables;
}

function typeNameForTable(tableName: string): string {
  return upperFirst(tableName);
}

function typeNameForValidator(name: string): string {
  return upperFirst(name);
}

function fieldPatch(before: FieldDef, after: FieldDef): Partial<FieldDef> {
  const patch: Partial<FieldDef> = {};
  if (JSON.stringify(before.type) !== JSON.stringify(after.type)) patch.type = after.type;
  if ((before.optional ?? false) !== (after.optional ?? false)) patch.optional = after.optional;
  if ((before.nullable ?? false) !== (after.nullable ?? false)) patch.nullable = after.nullable;
  return patch;
}

function isLossyFieldChange(before: FieldDef, after: FieldDef): boolean {
  return JSON.stringify(before.type) !== JSON.stringify(after.type);
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function lowerFirst(name: string): string {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

function upperFirst(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}
