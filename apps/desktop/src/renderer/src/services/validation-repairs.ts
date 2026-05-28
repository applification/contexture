import type { FieldType, Schema, TypeDef } from '@contexture/core/ir';
import type { Op } from '@renderer/store/ops';
import type { ValidationError } from './validation';

export interface ValidationRepair {
  label: string;
  op: Op;
  focusTypeName?: string;
}

export function repairForValidationError(
  schema: Schema,
  error: ValidationError,
): ValidationRepair | null {
  const importLoc = parseImportPath(error.path);
  if (importLoc) {
    const imp = schema.imports?.[importLoc.importIndex];
    if (!imp) return null;
    if (error.code === 'duplicate_alias') {
      return {
        label: 'Remove duplicate',
        op: { kind: 'remove_import_at', index: importLoc.importIndex },
      };
    }
    if (error.code === 'unknown_stdlib_namespace' || error.code === 'stdlib_alias_mismatch') {
      return {
        label: 'Remove import',
        op: { kind: 'remove_import', alias: imp.alias },
      };
    }
  }

  const loc = parseTypePath(error.path);
  if (!loc) return null;
  const type = schema.types[loc.typeIndex];
  if (!type) return null;

  if (error.code === 'enum_empty' && type.kind === 'enum') {
    return {
      label: 'Add value',
      op: { kind: 'add_value', typeName: type.name, value: 'value' },
      focusTypeName: type.name,
    };
  }

  if (error.code === 'enum_duplicate_value' && type.kind === 'enum') {
    const duplicateValue = type.values[loc.enumValueIndex ?? 0]?.value;
    if (!duplicateValue) return null;
    return {
      label: 'Rename value',
      op: {
        kind: 'update_value',
        typeName: type.name,
        value: duplicateValue,
        patch: {
          value: uniqueEnumValue(
            type.values.map((entry) => entry.value),
            duplicateValue,
          ),
        },
      },
      focusTypeName: type.name,
    };
  }

  if (error.code === 'unresolved_ref' && type.kind === 'object' && loc.fieldIndex !== undefined) {
    const field = type.fields[loc.fieldIndex];
    const refName = findRefTypeName(field?.type);
    if (!refName || refName.includes('.')) return null;
    return {
      label: 'Create type',
      op: { kind: 'add_type', type: { kind: 'object', name: refName, fields: [] } },
      focusTypeName: refName,
    };
  }

  if (
    error.code === 'convex_reserved_field_name' &&
    type.kind === 'object' &&
    loc.fieldIndex !== undefined
  ) {
    const field = type.fields[loc.fieldIndex];
    if (!field) return null;
    return {
      label: 'Rename field',
      op: {
        kind: 'update_field',
        typeName: type.name,
        fieldName: field.name,
        patch: { name: publicFieldName(type, field.name) },
      },
      focusTypeName: type.name,
    };
  }

  if (error.code === 'convex_reserved_table_name' && type.kind === 'object') {
    return {
      label: 'Rename table',
      op: {
        kind: 'update_type',
        name: type.name,
        patch: { tableName: publicTableName(type) },
      } as Op,
      focusTypeName: type.name,
    };
  }

  if (error.code === 'duplicate_convex_table_name' && type.kind === 'object') {
    return {
      label: 'Rename table',
      op: {
        kind: 'update_type',
        name: type.name,
        patch: { tableName: uniqueTableName(schema, type) },
      } as Op,
      focusTypeName: type.name,
    };
  }

  if (
    (error.code === 'convex_index_unknown_field' ||
      error.code === 'convex_index_duplicate_field') &&
    type.kind === 'object' &&
    loc.indexIndex !== undefined &&
    loc.indexFieldIndex !== undefined
  ) {
    const index = type.indexes?.[loc.indexIndex];
    if (!index) return null;
    const fields = index.fields.filter((_, i) => i !== loc.indexFieldIndex);
    return fields.length === 0
      ? {
          label: 'Remove index',
          op: { kind: 'remove_index', typeName: type.name, name: index.name },
          focusTypeName: type.name,
        }
      : {
          label:
            error.code === 'convex_index_duplicate_field' ? 'Remove duplicate' : 'Remove field',
          op: { kind: 'update_index', typeName: type.name, name: index.name, patch: { fields } },
          focusTypeName: type.name,
        };
  }

  if (error.code === 'duplicate_field_name' && type.kind === 'object') {
    const field = type.fields[loc.fieldIndex ?? 0];
    if (!field) return null;
    return {
      label: 'Rename field',
      op: {
        kind: 'update_field',
        typeName: type.name,
        fieldName: field.name,
        patch: { name: uniqueFieldName(type, field.name, loc.fieldIndex ?? 0) },
      },
      focusTypeName: type.name,
    };
  }

  if (
    error.code === 'discriminator_variant_not_found' &&
    type.kind === 'discriminatedUnion' &&
    loc.variantIndex !== undefined
  ) {
    const variantName = type.variants[loc.variantIndex];
    if (!variantName || schema.types.some((candidate) => candidate.name === variantName)) {
      return null;
    }
    return {
      label: 'Create variant',
      op: {
        kind: 'add_type',
        type: {
          kind: 'object',
          name: variantName,
          fields: [
            {
              name: type.discriminator,
              type: { kind: 'literal', value: discriminatorLiteralValue(variantName) },
            },
          ],
        },
      },
      focusTypeName: variantName,
    };
  }

  if (
    error.code === 'discriminator_variant_not_object' &&
    type.kind === 'discriminatedUnion' &&
    loc.variantIndex !== undefined
  ) {
    const variantName = type.variants[loc.variantIndex];
    if (!variantName) return null;
    return {
      label: 'Remove variant',
      op: { kind: 'remove_variant', typeName: type.name, variant: variantName },
      focusTypeName: type.name,
    };
  }

  if (
    error.code === 'discriminator_missing_on_variant' &&
    type.kind === 'discriminatedUnion' &&
    loc.variantIndex !== undefined
  ) {
    const variantName = type.variants[loc.variantIndex];
    const variant = schema.types.find((candidate) => candidate.name === variantName);
    if (!variantName || variant?.kind !== 'object') return null;
    return {
      label: 'Add discriminator',
      op: {
        kind: 'add_field',
        typeName: variant.name,
        field: {
          name: type.discriminator,
          type: { kind: 'literal', value: discriminatorLiteralValue(variant.name) },
        },
        index: 0,
      },
      focusTypeName: variant.name,
    };
  }

  return null;
}

export function parseImportPath(path: string): { importIndex: number } | null {
  const match = path.match(/^imports\.(\d+)/u);
  if (!match) return null;
  return { importIndex: Number(match[1]) };
}

export function parseTypePath(path: string): {
  typeIndex: number;
  fieldIndex?: number;
  indexIndex?: number;
  indexFieldIndex?: number;
  variantIndex?: number;
  enumValueIndex?: number;
} | null {
  const typeMatch = path.match(/^types\.(\d+)/u);
  if (!typeMatch) return null;
  const typeIndex = Number(typeMatch[1]);
  const fieldMatch = path.match(/^types\.\d+\.fields\.(\d+)/u);
  const indexMatch = path.match(/^types\.\d+\.indexes\.(\d+)\.fields\.(\d+)/u);
  const variantMatch = path.match(/^types\.\d+\.variants\.(\d+)/u);
  const enumValueMatch = path.match(/^types\.\d+\.values\.(\d+)/u);
  return {
    typeIndex,
    fieldIndex: fieldMatch ? Number(fieldMatch[1]) : undefined,
    indexIndex: indexMatch ? Number(indexMatch[1]) : undefined,
    indexFieldIndex: indexMatch ? Number(indexMatch[2]) : undefined,
    variantIndex: variantMatch ? Number(variantMatch[1]) : undefined,
    enumValueIndex: enumValueMatch ? Number(enumValueMatch[1]) : undefined,
  };
}

function findRefTypeName(type: FieldType | undefined): string | null {
  if (!type) return null;
  if (type.kind === 'ref') return type.typeName;
  if (type.kind === 'array') return findRefTypeName(type.element);
  return null;
}

function publicFieldName(type: Extract<TypeDef, { kind: 'object' }>, current: string): string {
  const base = current.replace(/^_+/u, '') || 'field';
  const existing = new Set(
    type.fields.filter((field) => field.name !== current).map((field) => field.name),
  );
  if (!existing.has(base)) return base;
  for (let i = 2; i <= existing.size + 2; i++) {
    const candidate = `${base}${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}${existing.size + 1}`;
}

function uniqueFieldName(
  type: Extract<TypeDef, { kind: 'object' }>,
  current: string,
  currentIndex: number,
): string {
  const existing = new Set(
    type.fields.filter((_, index) => index !== currentIndex).map((field) => field.name),
  );
  const base = current || 'field';
  if (!existing.has(base)) return base;
  for (let i = 2; i <= existing.size + 2; i++) {
    const candidate = `${base}${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}${existing.size + 1}`;
}

function publicTableName(type: Extract<TypeDef, { kind: 'object' }>): string {
  const current = type.tableName ?? `${type.name.charAt(0).toLowerCase()}${type.name.slice(1)}`;
  return current.replace(/^_+/u, '') || 'table';
}

function uniqueTableName(schema: Schema, type: Extract<TypeDef, { kind: 'object' }>): string {
  const current = type.tableName ?? `${type.name.charAt(0).toLowerCase()}${type.name.slice(1)}`;
  const taken = new Set(
    objectTypesExcept(schema, type).map(
      (candidate) => candidate.tableName ?? defaultTableName(candidate.name),
    ),
  );
  const base = current.replace(/^_+/u, '') || defaultTableName(type.name);
  if (!taken.has(base)) return base;
  for (let i = 2; i <= taken.size + 2; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${taken.size + 1}`;
}

function objectTypesExcept(
  schema: Schema,
  type: Extract<TypeDef, { kind: 'object' }>,
): Extract<TypeDef, { kind: 'object' }>[] {
  return schema.types.filter(
    (candidate): candidate is Extract<TypeDef, { kind: 'object' }> =>
      candidate.kind === 'object' && candidate !== type,
  );
}

function defaultTableName(typeName: string): string {
  return `${typeName.charAt(0).toLowerCase()}${typeName.slice(1)}`;
}

function uniqueEnumValue(values: readonly string[], duplicateValue: string): string {
  const taken = new Set(values);
  const base = duplicateValue || 'value';
  for (let i = 2; i <= taken.size + 2; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${taken.size + 1}`;
}

function discriminatorLiteralValue(typeName: string): string {
  return typeName
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
}
