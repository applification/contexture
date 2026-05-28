/**
 * Semantic validation of an IR.
 *
 * Structural validation (zod meta-schema) lives in `ir.ts`. This module
 * checks the things zod can't: unresolved refs, import consistency,
 * duplicate aliases / type names, discriminated-union invariants, and enum
 * invariants. It is the source of truth consumed by both:
 *
 *   1. `apply()` in `ops.ts`, which uses it to delta-reject any op whose
 *      result would introduce a *new* issue (the chat-tool-call gate).
 *   2. The renderer's validation panel, which surfaces the issues to the
 *      user for hand-editing scenarios.
 *
 * The optional `StdlibCatalog` enables namespace-aware ref resolution and
 * import validation. Callers without stdlib context (e.g. core unit tests)
 * pass nothing and get import-only resolution.
 */
import type { FieldType, ImportDecl, Schema, TypeDef } from './ir';

/**
 * Stdlib namespace catalog. The renderer / main process build one from
 * `@contexture/stdlib/registry`; tests can build a synthetic one.
 */
export interface StdlibCatalog {
  /** All known stdlib namespace aliases (e.g. `'common'`, `'place'`). */
  namespaces: readonly string[];
  /** True iff the namespace defines a type with that name. */
  hasType: (namespace: string, typeName: string) => boolean;
}

export type SemanticIssueCode =
  | 'unresolved_ref'
  | 'unknown_stdlib_namespace'
  | 'stdlib_alias_mismatch'
  | 'duplicate_alias'
  | 'duplicate_type_name'
  | 'duplicate_field_name'
  | 'discriminator_variant_not_found'
  | 'discriminator_variant_not_object'
  | 'discriminator_missing_on_variant'
  | 'enum_empty'
  | 'enum_duplicate_value'
  | 'duplicate_convex_table_name'
  | 'convex_reserved_table_name'
  | 'convex_reserved_field_name'
  | 'convex_index_duplicate_field'
  | 'convex_index_unknown_field';

export interface SemanticIssue {
  code: SemanticIssueCode;
  path: string;
  message: string;
  /** Remediation suggestion the chat / UI should surface verbatim. */
  hint?: string;
}

export function checkSemantic(schema: Schema, catalog?: StdlibCatalog): SemanticIssue[] {
  if (!schema || schema.version !== '1') return [];
  return [
    ...checkImports(schema, catalog),
    ...checkRefs(schema, catalog),
    ...checkDuplicateTypeNames(schema),
    ...checkDuplicateFieldNames(schema),
    ...checkDuplicateConvexTableNames(schema),
    ...checkConvexTableShapes(schema),
    ...checkDiscriminatedUnions(schema),
    ...checkEnums(schema),
  ];
}

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

function checkDuplicateConvexTableNames(schema: Schema): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const seen = new Map<string, number>();

  schema.types.forEach((type, i) => {
    if (type.kind !== 'object' || type.table !== true) return;
    const name = convexTableName(type);
    const first = seen.get(name);
    if (first !== undefined) {
      issues.push({
        code: 'duplicate_convex_table_name',
        path: `types.${i}.tableName`,
        message: `Convex table name "${name}" is already used by types.${first}.`,
      });
      return;
    }
    seen.set(name, i);
  });

  return issues;
}

function convexTableName(type: ObjectType): string {
  return type.tableName ?? `${type.name.charAt(0).toLowerCase()}${type.name.slice(1)}`;
}

function checkConvexTableShapes(schema: Schema): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object' || type.table !== true) return;
    const tableName = convexTableName(type);
    if (tableName.startsWith('_')) {
      issues.push({
        code: 'convex_reserved_table_name',
        path: `types.${typeIndex}.tableName`,
        message: `Convex reserves table names starting with "_".`,
        hint: 'Rename the type or set tableName to a public Convex table name.',
      });
    }

    const fieldNames = new Set(type.fields.map((field) => field.name));
    type.fields.forEach((field, fieldIndex) => {
      if (!field.name.startsWith('_')) return;
      issues.push({
        code: 'convex_reserved_field_name',
        path: `types.${typeIndex}.fields.${fieldIndex}.name`,
        message: `Convex reserves field names starting with "_".`,
        hint: 'Rename the field before emitting convex/schema.ts.',
      });
    });

    (type.indexes ?? []).forEach((index, indexIndex) => {
      const seenIndexFields = new Set<string>();
      index.fields.forEach((fieldName, fieldIndex) => {
        if (seenIndexFields.has(fieldName)) {
          issues.push({
            code: 'convex_index_duplicate_field',
            path: `types.${typeIndex}.indexes.${indexIndex}.fields.${fieldIndex}`,
            message: `Convex index "${index.name}" includes field "${fieldName}" more than once.`,
            hint: 'Remove the duplicate field from the index.',
          });
        } else {
          seenIndexFields.add(fieldName);
        }
        if (fieldNames.has(fieldName)) return;
        issues.push({
          code: 'convex_index_unknown_field',
          path: `types.${typeIndex}.indexes.${indexIndex}.fields.${fieldIndex}`,
          message: `Convex index "${index.name}" references unknown field "${fieldName}".`,
          hint: 'Use an existing table field or remove it from the index.',
        });
      });
    });
  });
  return issues;
}

function checkImports(schema: Schema, catalog?: StdlibCatalog): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const seenAliases = new Set<string>();
  (schema.imports ?? []).forEach((imp, i) => {
    const path = `imports.${i}`;
    if (seenAliases.has(imp.alias)) {
      issues.push({
        code: 'duplicate_alias',
        path,
        message: `Duplicate import alias "${imp.alias}".`,
      });
    } else {
      seenAliases.add(imp.alias);
    }
    if (imp.kind === 'stdlib' && catalog) {
      const ns = stdlibNamespaceFromPath(imp.path);
      if (ns === null || !catalog.namespaces.includes(ns)) {
        issues.push({
          code: 'unknown_stdlib_namespace',
          path,
          message: `Unknown stdlib namespace "${imp.path}".`,
          hint: `Available: ${catalog.namespaces.map((n) => `@contexture/${n}`).join(', ')}.`,
        });
      } else if (imp.alias !== ns) {
        issues.push({
          code: 'stdlib_alias_mismatch',
          path,
          message: `Stdlib import alias "${imp.alias}" must match its namespace "${ns}".`,
          hint: `Set alias to "${ns}" so refs like "${ns}.SomeType" resolve.`,
        });
      }
    }
  });
  return issues;
}

function checkRefs(schema: Schema, catalog?: StdlibCatalog): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const localNames = new Set(schema.types.map((t) => t.name));
  const aliases = new Set((schema.imports ?? []).map((i) => i.alias));

  const walk = (t: FieldType, path: string): void => {
    if (t.kind === 'ref') {
      if (!resolves(t.typeName, localNames, aliases, catalog)) {
        issues.push({
          code: 'unresolved_ref',
          path,
          message: `Unresolved ref "${t.typeName}".`,
          hint: hintForUnresolvedRef(t.typeName, catalog),
        });
      }
    } else if (t.kind === 'array') {
      walk(t.element, `${path}.element`);
    }
  };

  schema.types.forEach((type, ti) => {
    if (type.kind !== 'object') return;
    type.fields.forEach((f, fi) => {
      walk(f.type, `types.${ti}.fields.${fi}.type`);
    });
  });
  return issues;
}

function resolves(
  typeName: string,
  locals: Set<string>,
  aliases: Set<string>,
  catalog?: StdlibCatalog,
): boolean {
  const dot = typeName.indexOf('.');
  if (dot === -1) return locals.has(typeName);
  const ns = typeName.slice(0, dot);
  const name = typeName.slice(dot + 1);
  if (aliases.has(ns)) return true;
  return catalog?.hasType(ns, name) ?? false;
}

function hintForUnresolvedRef(typeName: string, catalog?: StdlibCatalog): string | undefined {
  if (!catalog) return undefined;
  const dot = typeName.indexOf('.');
  if (dot !== -1) return undefined;
  for (const ns of catalog.namespaces) {
    if (catalog.hasType(ns, typeName)) {
      return `Did you mean "${ns}.${typeName}"?`;
    }
  }
  return undefined;
}

function checkDuplicateTypeNames(schema: Schema): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const seen = new Set<string>();
  schema.types.forEach((type, i) => {
    if (seen.has(type.name)) {
      issues.push({
        code: 'duplicate_type_name',
        path: `types.${i}`,
        message: `Duplicate type name "${type.name}".`,
      });
    } else {
      seen.add(type.name);
    }
  });
  return issues;
}

function checkDuplicateFieldNames(schema: Schema): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object') return;
    const seen = new Set<string>();
    type.fields.forEach((field, fieldIndex) => {
      if (seen.has(field.name)) {
        issues.push({
          code: 'duplicate_field_name',
          path: `types.${typeIndex}.fields.${fieldIndex}.name`,
          message: `Duplicate field name "${field.name}" in "${type.name}".`,
          hint: 'Rename one of the fields before editing indexes or generated outputs.',
        });
      } else {
        seen.add(field.name);
      }
    });
  });
  return issues;
}

function checkDiscriminatedUnions(schema: Schema): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const byName = new Map(schema.types.map((t) => [t.name, t]));

  schema.types.forEach((type, ti) => {
    if (type.kind !== 'discriminatedUnion') return;
    type.variants.forEach((variantName, vi) => {
      const path = `types.${ti}.variants.${vi}`;
      const variant = byName.get(variantName);
      if (!variant) {
        issues.push({
          code: 'discriminator_variant_not_found',
          path,
          message: `Discriminated union variant "${variantName}" is not defined.`,
        });
        return;
      }
      if (variant.kind !== 'object') {
        issues.push({
          code: 'discriminator_variant_not_object',
          path,
          message: `Discriminated union variant "${variantName}" must be an object type.`,
        });
        return;
      }
      if (!variant.fields.some((f) => f.name === type.discriminator)) {
        issues.push({
          code: 'discriminator_missing_on_variant',
          path,
          message: `Variant "${variantName}" is missing discriminator field "${type.discriminator}".`,
        });
      }
    });
  });
  return issues;
}

function checkEnums(schema: Schema): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  schema.types.forEach((type, ti) => {
    if (type.kind !== 'enum') return;
    if (type.values.length === 0) {
      issues.push({
        code: 'enum_empty',
        path: `types.${ti}.values`,
        message: `Enum "${type.name}" must have at least one value.`,
      });
      return;
    }
    const seen = new Set<string>();
    type.values.forEach((value, vi) => {
      if (seen.has(value.value)) {
        issues.push({
          code: 'enum_duplicate_value',
          path: `types.${ti}.values.${vi}`,
          message: `Duplicate enum value "${value.value}" in "${type.name}".`,
        });
      } else {
        seen.add(value.value);
      }
    });
  });
  return issues;
}

function stdlibNamespaceFromPath(path: ImportDecl['path']): string | null {
  const prefix = '@contexture/';
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (rest.length === 0 || rest.includes('/')) return null;
  return rest;
}

/**
 * Compare two issue lists and return any that exist in `post` but not in
 * `pre` (matched by `code` + `path` + `message` so a recurring issue
 * after an unrelated edit is not blamed on the new op).
 *
 * Used by `apply()` to delta-reject ops that *introduce* new semantic
 * problems while letting through ops that touch parts of the schema with
 * pre-existing issues.
 */
export function newIssues(pre: SemanticIssue[], post: SemanticIssue[]): SemanticIssue[] {
  const key = (i: SemanticIssue) => `${i.code}|${i.path}|${i.message}`;
  const seen = new Set(pre.map(key));
  return post.filter((i) => !seen.has(key(i)));
}
