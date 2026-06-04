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
  | 'object_extends_not_found'
  | 'object_extends_non_object'
  | 'object_extends_cycle'
  | 'object_extends_duplicate_field'
  | 'discriminator_variant_not_found'
  | 'discriminator_variant_not_object'
  | 'discriminator_missing_on_variant'
  | 'invariant_duplicate_name'
  | 'invariant_unknown_field'
  | 'invariant_unknown_array_field'
  | 'invariant_array_target_not_object'
  | 'enum_empty'
  | 'enum_duplicate_value'
  | 'duplicate_convex_table_name'
  | 'convex_reserved_table_name'
  | 'convex_reserved_field_name'
  | 'convex_index_duplicate_field'
  | 'convex_index_unknown_field'
  | 'convex_index_name_collision'
  | 'convex_index_limit_exceeded'
  | 'convex_search_index_on_non_table'
  | 'convex_search_index_duplicate_name'
  | 'convex_search_index_duplicate_filter_field'
  | 'convex_search_index_unknown_search_field'
  | 'convex_search_index_non_string_search_field'
  | 'convex_search_index_unknown_filter_field'
  | 'convex_search_index_filter_field_limit_exceeded'
  | 'relationship_target_not_table'
  | 'relationship_scope_field_missing'
  | 'relationship_set_null_requires_nullable'
  | 'relationship_cleanup_index_missing'
  | 'relationship_ownership_scope_missing'
  | 'derivation_missing_source'
  | 'derivation_unknown_source'
  | 'derivation_missing_refresh'
  | 'derivation_owner_not_writable'
  | 'operational_timezone_missing'
  | 'operational_inbound_idempotency_missing'
  | 'operational_enum_evolution'
  | 'operational_conflict_token_missing'
  | 'operational_notification_model_missing';

export type SemanticIssueSeverity = 'error' | 'warning';

export interface SemanticIssue {
  code: SemanticIssueCode;
  path: string;
  message: string;
  severity: SemanticIssueSeverity;
  /** Remediation suggestion the chat / UI should surface verbatim. */
  hint?: string;
}

export function checkSemantic(schema: Schema, catalog?: StdlibCatalog): SemanticIssue[] {
  if (!schema || schema.version !== '1') return [];
  return withDefaultSeverity([
    ...checkImports(schema, catalog),
    ...checkRefs(schema, catalog),
    ...checkDuplicateTypeNames(schema),
    ...checkDuplicateFieldNames(schema),
    ...checkObjectExtends(schema),
    ...checkObjectInvariants(schema),
    ...checkDuplicateConvexTableNames(schema),
    ...checkConvexTableShapes(schema),
    ...checkDerivations(schema),
    ...checkDiscriminatedUnions(schema),
    ...checkEnums(schema),
    ...checkOperationalAdvice(schema),
  ]);
}

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

type SemanticIssueDraft = Omit<SemanticIssue, 'severity'> & {
  severity?: SemanticIssueSeverity;
};

function withDefaultSeverity(issues: SemanticIssueDraft[]): SemanticIssue[] {
  return issues.map((issue) => ({ severity: 'error', ...issue }));
}

function checkDuplicateConvexTableNames(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
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

function checkConvexTableShapes(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object') return;
    if (type.table !== true) {
      if ((type.searchIndexes ?? []).length > 0) {
        issues.push({
          code: 'convex_search_index_on_non_table',
          path: `types.${typeIndex}.searchIndexes`,
          message: `Only Convex table types can define search indexes.`,
          hint: 'Mark the object as a table or remove searchIndexes.',
        });
      }
      return;
    }
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
    const fieldsByName = new Map(type.fields.map((field) => [field.name, field]));
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

    const plainIndexNames = new Set((type.indexes ?? []).map((index) => index.name));
    const searchIndexNames = new Set<string>();
    (type.searchIndexes ?? []).forEach((index, indexIndex) => {
      if (searchIndexNames.has(index.name)) {
        issues.push({
          code: 'convex_search_index_duplicate_name',
          path: `types.${typeIndex}.searchIndexes.${indexIndex}.name`,
          message: `Convex search index "${index.name}" is already used on "${type.name}".`,
          hint: 'Rename the search index so each index name is unique per table.',
        });
      } else {
        searchIndexNames.add(index.name);
      }

      if (plainIndexNames.has(index.name)) {
        issues.push({
          code: 'convex_index_name_collision',
          path: `types.${typeIndex}.searchIndexes.${indexIndex}.name`,
          message: `Convex search index "${index.name}" conflicts with a plain index on "${type.name}".`,
          hint: 'Use a distinct name; Convex index names must be unique per table.',
        });
      }

      const searchField = fieldsByName.get(index.searchField);
      if (!searchField) {
        issues.push({
          code: 'convex_search_index_unknown_search_field',
          path: `types.${typeIndex}.searchIndexes.${indexIndex}.searchField`,
          message: `Convex search index "${index.name}" references unknown search field "${index.searchField}".`,
          hint: 'Use an existing string field as the searchField.',
        });
      } else if (searchField.type.kind !== 'string') {
        issues.push({
          code: 'convex_search_index_non_string_search_field',
          path: `types.${typeIndex}.searchIndexes.${indexIndex}.searchField`,
          message: `Convex search index "${index.name}" searchField "${index.searchField}" must be a string field.`,
          hint: 'Choose a string field such as searchText or add a denormalized string search handle.',
        });
      }

      const filterFields = index.filterFields ?? [];
      if (filterFields.length > 16) {
        issues.push({
          code: 'convex_search_index_filter_field_limit_exceeded',
          path: `types.${typeIndex}.searchIndexes.${indexIndex}.filterFields`,
          message: `Convex search index "${index.name}" has ${filterFields.length} filter fields; Convex allows up to 16.`,
          hint: 'Keep only fields used for equality filters in withSearchIndex queries.',
        });
      }
      const seenFilterFields = new Set<string>();
      filterFields.forEach((fieldName, fieldIndex) => {
        if (seenFilterFields.has(fieldName)) {
          issues.push({
            code: 'convex_search_index_duplicate_filter_field',
            path: `types.${typeIndex}.searchIndexes.${indexIndex}.filterFields.${fieldIndex}`,
            message: `Convex search index "${index.name}" includes filter field "${fieldName}" more than once.`,
            hint: 'Remove the duplicate filter field from the search index.',
          });
        } else {
          seenFilterFields.add(fieldName);
        }
        if (fieldNames.has(fieldName)) return;
        issues.push({
          code: 'convex_search_index_unknown_filter_field',
          path: `types.${typeIndex}.searchIndexes.${indexIndex}.filterFields.${fieldIndex}`,
          message: `Convex search index "${index.name}" references unknown filter field "${fieldName}".`,
          hint: 'Use an existing table field or remove it from filterFields.',
        });
      });
    });

    const totalIndexes = (type.indexes ?? []).length + (type.searchIndexes ?? []).length;
    if (totalIndexes > 32) {
      issues.push({
        code: 'convex_index_limit_exceeded',
        path: `types.${typeIndex}.indexes`,
        message: `Convex table "${type.name}" defines ${totalIndexes} indexes; Convex allows up to 32 indexes per table.`,
        hint: 'Remove low-value plain or search indexes before emitting convex/schema.ts.',
      });
    }
  });
  return issues;
}

function checkImports(schema: Schema, catalog?: StdlibCatalog): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
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

function checkDerivations(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  const objects = schema.types.filter((type): type is ObjectType => type.kind === 'object');
  const objectsByName = new Map(objects.map((type) => [type.name, type]));

  objects.forEach((type, typeIndex) => {
    const fieldNames = new Set(type.fields.map((field) => field.name));
    type.fields.forEach((field, fieldIndex) => {
      const derivation = field.derivation;
      if (!derivation) return;
      const path = `types.${typeIndex}.fields.${fieldIndex}.derivation`;
      const sources = derivation.sources ?? [];

      if (derivation.kind !== 'snapshot' && sources.length === 0) {
        issues.push({
          code: 'derivation_missing_source',
          path: `${path}.sources`,
          severity: 'warning',
          message: `${type.name}.${field.name} declares a ${derivation.kind} derivation without source fields.`,
          hint: 'Add source field paths so downstream app code and reviewers can see what invalidates this value.',
        });
      }

      if (
        derivation.kind !== 'snapshot' &&
        sources.length > 0 &&
        !derivation.refresh &&
        !derivation.driftPolicy
      ) {
        issues.push({
          code: 'derivation_missing_refresh',
          path,
          severity: 'warning',
          message: `${type.name}.${field.name} can drift because it has sources but no refresh or drift policy.`,
          hint: 'Declare whether it refreshes on write, asynchronously, on read, manually, or is allowed to drift.',
        });
      }

      if (
        derivation.owner &&
        derivation.writableBy &&
        !derivation.writableBy.includes(derivation.owner)
      ) {
        issues.push({
          code: 'derivation_owner_not_writable',
          path: `${path}.writableBy`,
          severity: 'warning',
          message: `${type.name}.${field.name} is owned by ${derivation.owner}, but writableBy does not include ${derivation.owner}.`,
          hint: 'Include the owner in writableBy, or change owner if another boundary is authoritative for this derived value.',
        });
      }

      sources.forEach((source, sourceIndex) => {
        if (sourcePathExists(source, type, fieldNames, objectsByName)) return;
        issues.push({
          code: 'derivation_unknown_source',
          path: `${path}.sources.${sourceIndex}`,
          severity: 'warning',
          message: `${type.name}.${field.name} derivation source "${source}" does not match a known field path.`,
          hint: 'Use a field on the same object, a nested path such as ingredients[].grams, or a qualified path such as Ingredient.allergens.',
        });
      });
    });
  });

  return issues;
}

function sourcePathExists(
  source: string,
  owner: ObjectType,
  ownerFieldNames: ReadonlySet<string>,
  objectsByName: ReadonlyMap<string, ObjectType>,
): boolean {
  const normalized = source.replace(/\[\]/gu, '');
  const [first, second] = normalized.split('.');
  if (!first) return false;

  const qualifiedType = objectsByName.get(first);
  if (qualifiedType && second) {
    return hasNestedFieldPath(qualifiedType, normalized.split('.').slice(1), objectsByName);
  }

  if (!ownerFieldNames.has(first)) return false;
  return hasNestedFieldPath(owner, normalized.split('.'), objectsByName);
}

function hasNestedFieldPath(
  type: ObjectType,
  parts: readonly string[],
  objectsByName: ReadonlyMap<string, ObjectType>,
): boolean {
  let current: ObjectType | undefined = type;
  for (const part of parts) {
    if (!current) return false;
    const field = current.fields.find((candidate) => candidate.name === part);
    if (!field) return false;
    const refTarget = unwrapRefTarget(field.type);
    current = refTarget ? objectsByName.get(refTarget) : undefined;
  }
  return true;
}

function unwrapRefTarget(type: FieldType): string | undefined {
  if (type.kind === 'ref') return type.typeName;
  if (type.kind === 'array') return unwrapRefTarget(type.element);
  return undefined;
}

function checkRefs(schema: Schema, catalog?: StdlibCatalog): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  const localTypes = new Map(schema.types.map((t) => [t.name, t]));
  const localNames = new Set(localTypes.keys());
  const aliases = new Set((schema.imports ?? []).map((i) => i.alias));

  const walk = (
    t: FieldType,
    path: string,
    owner: ObjectType,
    fieldName: string,
    fieldOptional: boolean,
    fieldNullable: boolean,
    checkRefResolution: boolean,
    validateRelationship: boolean,
    visitedEmbeds: ReadonlySet<string>,
  ): void => {
    if (t.kind === 'ref') {
      if (checkRefResolution && !resolves(t.typeName, localNames, aliases, catalog)) {
        issues.push({
          code: 'unresolved_ref',
          path,
          message: `Unresolved ref "${t.typeName}".`,
          hint: hintForUnresolvedRef(t.typeName, catalog),
        });
      }
      if (validateRelationship) {
        issues.push(
          ...checkRelationshipMetadata(
            t,
            path,
            owner,
            fieldName,
            fieldOptional,
            fieldNullable,
            localTypes,
          ),
        );
      }
      const target = localTypes.get(t.typeName);
      if (
        validateRelationship &&
        target?.kind === 'object' &&
        target.table !== true &&
        !visitedEmbeds.has(target.name)
      ) {
        const nextVisited = new Set(visitedEmbeds);
        nextVisited.add(target.name);
        target.fields.forEach((field, fieldIndex) => {
          walk(
            field.type,
            `${path}.fields.${fieldIndex}.type`,
            owner,
            field.name,
            fieldOptional || field.optional === true,
            fieldNullable || field.nullable === true,
            false,
            true,
            nextVisited,
          );
        });
      }
    } else if (t.kind === 'array') {
      walk(
        t.element,
        `${path}.element`,
        owner,
        fieldName,
        fieldOptional,
        fieldNullable,
        checkRefResolution,
        validateRelationship,
        visitedEmbeds,
      );
    }
  };

  schema.types.forEach((type, ti) => {
    if (type.kind !== 'object') return;
    type.fields.forEach((f, fi) => {
      walk(
        f.type,
        `types.${ti}.fields.${fi}.type`,
        type,
        f.name,
        f.optional === true,
        f.nullable === true,
        true,
        type.table === true,
        new Set([type.name]),
      );
    });
  });
  return issues;
}

function checkRelationshipMetadata(
  ref: Extract<FieldType, { kind: 'ref' }>,
  path: string,
  owner: ObjectType,
  fieldName: string,
  fieldOptional: boolean,
  fieldNullable: boolean,
  localTypes: ReadonlyMap<string, TypeDef>,
): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  const target = localTypes.get(ref.typeName);
  const relationship = ref.relationship;
  if (relationship && (target?.kind !== 'object' || target.table !== true)) {
    issues.push({
      code: 'relationship_target_not_table',
      path: `${path}.relationship`,
      message: `Relationship field "${fieldName}" must reference a Convex table type.`,
      hint: 'Mark the target object as a Convex table or remove relationship metadata from this ref.',
    });
  }

  if (relationship?.onDelete === 'setNull' && !fieldOptional && !fieldNullable) {
    issues.push({
      code: 'relationship_set_null_requires_nullable',
      path: `${path}.relationship.onDelete`,
      message: `Relationship "${fieldName}" uses setNull but the field is required and non-nullable.`,
      hint: 'Mark the field nullable or optional, or use restrict/cascade/none.',
    });
  }

  if (relationship?.onDelete === 'cascade' || relationship?.onDelete === 'setNull') {
    const hasCleanupIndex = (owner.indexes ?? []).some((index) => index.fields[0] === fieldName);
    if (!hasCleanupIndex) {
      issues.push({
        code: 'relationship_cleanup_index_missing',
        path: `${path}.relationship.onDelete`,
        message: `Relationship "${fieldName}" uses ${relationship.onDelete} but source table "${owner.name}" has no cleanup index starting with "${fieldName}".`,
        hint: `Add an index on "${owner.name}" with "${fieldName}" as the first field before relying on generated cleanup plans.`,
      });
    }
  }

  const ownership = relationship?.ownership;
  if (ownership && !owner.fields.some((field) => field.name === ownership.scopeField)) {
    issues.push({
      code: 'relationship_scope_field_missing',
      path: `${path}.relationship.ownership.scopeField`,
      message: `Relationship "${fieldName}" uses missing ownership scope field "${ownership.scopeField}".`,
      hint: 'Use an existing source field such as householdId, tenantId, or orgId.',
    });
  }

  if (
    ownership &&
    target?.kind === 'object' &&
    !target.fields.some(
      (field) => field.name === (ownership.targetScopeField ?? ownership.scopeField),
    )
  ) {
    const targetField = ownership.targetScopeField ?? ownership.scopeField;
    issues.push({
      code: 'relationship_scope_field_missing',
      path: `${path}.relationship.ownership.targetScopeField`,
      message: `Relationship "${fieldName}" target is missing ownership scope field "${targetField}".`,
      hint: 'Set targetScopeField or add the corresponding scope field to the target table.',
    });
  }

  if (
    owner.table === true &&
    target?.kind === 'object' &&
    target.table === true &&
    !ownership &&
    relationship?.crossScope !== true
  ) {
    const axis = findSharedTenantAxis(owner, target, fieldName, ref.typeName, localTypes);
    if (axis) {
      issues.push({
        code: 'relationship_ownership_scope_missing',
        severity: 'warning',
        path: `${path}.relationship.ownership`,
        message: `${owner.name}.${fieldName} -> ${convexTableName(target)}: source and target share tenant axis "${axis.fieldName}" but no ownership scope is set.`,
        hint: `Add relationship.ownership.scopeField: "${axis.fieldName}"${
          axis.targetFieldName === axis.fieldName
            ? ''
            : ` and targetScopeField: "${axis.targetFieldName}"`
        }, or set relationship.crossScope: true to suppress this warning.`,
      });
    }
  }

  return issues;
}

function findSharedTenantAxis(
  owner: ObjectType,
  target: ObjectType,
  relationshipFieldName: string,
  relationshipTargetTypeName: string,
  localTypes: ReadonlyMap<string, TypeDef>,
): { fieldName: string; targetFieldName: string } | null {
  const strong = owner.fields.find((sourceField) => {
    if (
      !isRequiredField(sourceField) ||
      sourceField.name === relationshipFieldName ||
      isExcludedTenantAxisFieldName(sourceField.name)
    ) {
      return false;
    }
    const targetField = target.fields.find((field) => field.name === sourceField.name);
    if (
      !targetField ||
      !isRequiredField(targetField) ||
      isExcludedTenantAxisFieldName(targetField.name)
    ) {
      return false;
    }
    if (
      sourceField.type.kind !== 'ref' ||
      targetField.type.kind !== 'ref' ||
      sourceField.type.typeName !== targetField.type.typeName
    ) {
      return false;
    }
    const axisTarget = localTypes.get(sourceField.type.typeName);
    if (axisTarget?.kind !== 'object' || axisTarget.table !== true) return false;
    return sourceField.type.typeName !== relationshipTargetTypeName;
  });
  if (strong) return { fieldName: strong.name, targetFieldName: strong.name };

  const fallback = owner.fields.find((sourceField) => {
    if (
      !isRequiredField(sourceField) ||
      sourceField.name === relationshipFieldName ||
      isExcludedTenantAxisFieldName(sourceField.name)
    ) {
      return false;
    }
    if (!isLikelyTenantAxisName(sourceField.name) || sourceField.type.kind !== 'string') {
      return false;
    }
    const targetField = target.fields.find((field) => field.name === sourceField.name);
    return Boolean(
      targetField &&
        isRequiredField(targetField) &&
        !isExcludedTenantAxisFieldName(targetField.name) &&
        targetField.type.kind === 'string',
    );
  });
  return fallback ? { fieldName: fallback.name, targetFieldName: fallback.name } : null;
}

function isExcludedTenantAxisFieldName(name: string): boolean {
  return COMMON_NON_TENANT_AXIS_FIELD_NAMES.has(name);
}

const COMMON_NON_TENANT_AXIS_FIELD_NAMES = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'archivedAt',
  'timestamp',
  'name',
  'title',
  'description',
  'notes',
  'slug',
  'status',
  'type',
]);

function isRequiredField(field: ObjectType['fields'][number]): boolean {
  return field.optional !== true && field.nullable !== true;
}

function isLikelyTenantAxisName(name: string): boolean {
  return /^(household|tenant|org|organization|workspace|account|team|project)Id$/.test(name);
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

function checkDuplicateTypeNames(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
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

function checkDuplicateFieldNames(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
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

function checkObjectExtends(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  const byName = new Map(schema.types.map((type) => [type.name, type]));

  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object') return;
    type.extends?.forEach((baseName, baseIndex) => {
      const base = byName.get(baseName);
      const path = `types.${typeIndex}.extends.${baseIndex}`;
      if (!base) {
        issues.push({
          code: 'object_extends_not_found',
          path,
          message: `Object "${type.name}" extends missing type "${baseName}".`,
        });
        return;
      }
      if (base.kind !== 'object') {
        issues.push({
          code: 'object_extends_non_object',
          path,
          message: `Object "${type.name}" can only extend object types; "${baseName}" is a ${base.kind}.`,
        });
      }
    });

    const cycle = findExtendsCycle(type, byName);
    if (cycle) {
      issues.push({
        code: 'object_extends_cycle',
        path: `types.${typeIndex}.extends`,
        message: `Object inheritance cycle detected: ${cycle.join(' -> ')}.`,
      });
    }

    const inheritedFields = new Set(effectiveFields(type, byName, { includeOwn: false }).keys());
    type.fields.forEach((field, fieldIndex) => {
      if (!inheritedFields.has(field.name)) return;
      issues.push({
        code: 'object_extends_duplicate_field',
        path: `types.${typeIndex}.fields.${fieldIndex}.name`,
        message: `Field "${field.name}" on "${type.name}" is already inherited from an extended object.`,
        hint: 'Rename the field or remove it from either the child object or its base object.',
      });
    });
  });

  return issues;
}

function findExtendsCycle(type: ObjectType, byName: ReadonlyMap<string, TypeDef>): string[] | null {
  const path: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(current: ObjectType): string[] | null {
    if (visiting.has(current.name)) {
      const cycleStart = path.indexOf(current.name);
      return [...path.slice(Math.max(0, cycleStart)), current.name];
    }
    if (visited.has(current.name)) return null;
    visiting.add(current.name);
    path.push(current.name);
    for (const baseName of current.extends ?? []) {
      const base = byName.get(baseName);
      if (base?.kind !== 'object') continue;
      const cycle = visit(base);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(current.name);
    visited.add(current.name);
    return null;
  }

  return visit(type);
}

function checkObjectInvariants(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  const byName = new Map(schema.types.map((type) => [type.name, type]));

  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object') return;
    const invariants = type.invariants ?? [];
    const names = new Set<string>();
    const fields = effectiveFields(type, byName);

    invariants.forEach((invariant, invariantIndex) => {
      const path = `types.${typeIndex}.invariants.${invariantIndex}`;
      if (names.has(invariant.name)) {
        issues.push({
          code: 'invariant_duplicate_name',
          path: `${path}.name`,
          message: `Duplicate invariant name "${invariant.name}" in "${type.name}".`,
        });
      }
      names.add(invariant.name);

      const checkField = (fieldName: string, propertyPath: string) => {
        if (fields.has(fieldName)) return;
        issues.push({
          code: 'invariant_unknown_field',
          path: `${path}.${propertyPath}`,
          message: `Invariant "${invariant.name}" references missing field "${fieldName}" on "${type.name}".`,
        });
      };

      switch (invariant.kind) {
        case 'requiresWhen':
          checkField(invariant.when.field, 'when.field');
          invariant.requires?.forEach((fieldName, fieldIndex) => {
            checkField(fieldName, `requires.${fieldIndex}`);
          });
          invariant.forbids?.forEach((fieldName, fieldIndex) => {
            checkField(fieldName, `forbids.${fieldIndex}`);
          });
          break;
        case 'exactlyOneOf':
        case 'mutuallyExclusive':
          invariant.fields.forEach((fieldName, fieldIndex) => {
            checkField(fieldName, `fields.${fieldIndex}`);
          });
          break;
        case 'fieldPredicate':
          checkField(invariant.field, 'field');
          break;
        case 'uniqueInArray': {
          const arrayField = fields.get(invariant.arrayField);
          if (!arrayField) {
            issues.push({
              code: 'invariant_unknown_array_field',
              path: `${path}.arrayField`,
              message: `Invariant "${invariant.name}" references missing array field "${invariant.arrayField}" on "${type.name}".`,
            });
            break;
          }
          const elementObject = arrayElementObject(arrayField.type, byName);
          if (!elementObject) {
            issues.push({
              code: 'invariant_array_target_not_object',
              path: `${path}.arrayField`,
              message: `Invariant "${invariant.name}" requires "${invariant.arrayField}" to be an array of object values.`,
              hint: 'Use an array of object refs or move the invariant to the child table/mutation layer.',
            });
            break;
          }
          const elementFields = effectiveFields(elementObject, byName);
          if (!elementFields.has(invariant.uniqueField)) {
            issues.push({
              code: 'invariant_unknown_field',
              path: `${path}.uniqueField`,
              message: `Invariant "${invariant.name}" references missing field "${invariant.uniqueField}" on array element "${elementObject.name}".`,
            });
          }
          if (invariant.where && !elementFields.has(invariant.where.field)) {
            issues.push({
              code: 'invariant_unknown_field',
              path: `${path}.where.field`,
              message: `Invariant "${invariant.name}" references missing field "${invariant.where.field}" on array element "${elementObject.name}".`,
            });
          }
          break;
        }
      }
    });
  });

  return issues;
}

function effectiveFields(
  type: ObjectType,
  byName: ReadonlyMap<string, TypeDef>,
  options: { includeOwn?: boolean } = {},
): Map<string, ObjectType['fields'][number]> {
  const includeOwn = options.includeOwn !== false;
  const fields = new Map<string, ObjectType['fields'][number]>();
  const seen = new Set<string>();

  function addFrom(current: ObjectType): void {
    if (seen.has(current.name)) return;
    seen.add(current.name);
    for (const baseName of current.extends ?? []) {
      const base = byName.get(baseName);
      if (base?.kind === 'object') addFrom(base);
    }
    if (current !== type || includeOwn) {
      for (const field of current.fields) fields.set(field.name, field);
    }
  }

  addFrom(type);
  return fields;
}

function arrayElementObject(
  type: FieldType,
  byName: ReadonlyMap<string, TypeDef>,
): ObjectType | null {
  if (type.kind !== 'array') return null;
  const element = type.element;
  if (element.kind !== 'ref') return null;
  const target = byName.get(element.typeName);
  return target?.kind === 'object' ? target : null;
}

function checkDiscriminatedUnions(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
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
      if (!effectiveFields(variant, byName).has(type.discriminator)) {
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

function checkEnums(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
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

function checkOperationalAdvice(schema: Schema): SemanticIssueDraft[] {
  return [
    ...checkTimezoneAdvice(schema),
    ...checkInboundIdempotencyAdvice(schema),
    ...checkEnumEvolutionAdvice(schema),
    ...checkConflictTokenAdvice(schema),
    ...checkNotificationAdvice(schema),
  ];
}

function checkTimezoneAdvice(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  const objects = schema.types.filter((type): type is ObjectType => type.kind === 'object');
  const likelyHousehold = objects.find((type) => type.name === 'Household');
  if (!likelyHousehold || hasTimezoneField(likelyHousehold)) return issues;

  const temporalField = objects
    .flatMap((type, typeIndex) =>
      type.fields.map((field, fieldIndex) => ({ type, typeIndex, field, fieldIndex })),
    )
    .find(({ type, field }) => {
      if (type.name === likelyHousehold.name && field.name === 'timeZoneId') return false;
      return isHouseholdScoped(type) && isHouseholdLocalTemporalField(field);
    });

  if (!temporalField) return issues;
  issues.push({
    code: 'operational_timezone_missing',
    severity: 'warning',
    path: `types.${schema.types.indexOf(likelyHousehold)}.fields`,
    message: `Household-scoped field "${temporalField.type.name}.${temporalField.field.name}" has local calendar or scheduling semantics, but Household has no timezone field.`,
    hint: 'Add Household.timeZoneId as a ref to place.TimeZoneId so server jobs, week boundaries, expiry checks, and travelling clients use the same household-local clock.',
  });
  return issues;
}

function checkInboundIdempotencyAdvice(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  const objects = schema.types.filter((type): type is ObjectType => type.kind === 'object');
  const channelIdentityIndex = objects.findIndex((type) => type.name === 'ChannelIdentity');
  if (channelIdentityIndex === -1) return issues;
  if (objects.some(isInboundDeliveryStateType)) return issues;

  issues.push({
    code: 'operational_inbound_idempotency_missing',
    severity: 'warning',
    path: `types.${schema.types.indexOf(objects[channelIdentityIndex] as TypeDef)}`,
    message:
      'ChannelIdentity models conversational identity, but no inbound delivery or message state is modeled.',
    hint: 'Ensure the app runtime owns webhook idempotency and pending conversation state, or add a table such as InboundMessage/WebhookEvent with provider message ids and processing status.',
  });
  return issues;
}

function checkEnumEvolutionAdvice(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  const enums = new Map(
    schema.types
      .filter((type): type is Extract<TypeDef, { kind: 'enum' }> => type.kind === 'enum')
      .map((type) => [type.name, type]),
  );
  if (enums.size === 0) return issues;

  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object') return;
    type.fields.forEach((field, fieldIndex) => {
      const enumName = unwrapRefTarget(field.type);
      if (!enumName) return;
      const enumType = enums.get(enumName);
      if (!enumType) return;
      if (enumType.compatibility?.enumEvolution) return;
      if (!isLikelyClientSurfaceEnum(enumName, field, type, schema)) return;
      issues.push({
        code: 'operational_enum_evolution',
        severity: 'warning',
        path: `types.${typeIndex}.fields.${fieldIndex}.type`,
        message: `${type.name}.${field.name} uses closed enum "${enumName}" in a likely client-facing surface.`,
        hint: 'Keep the enum closed for internal safety, but make web/mobile/API clients render unknown values gracefully or map them at the compatibility boundary.',
      });
    });
  });

  return dedupeIssues(issues);
}

function checkConflictTokenAdvice(schema: Schema): SemanticIssueDraft[] {
  const issues: SemanticIssueDraft[] = [];
  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object' || type.table !== true) return;
    if (!hasUpdatedAtField(type) || hasConflictTokenField(type)) return;
    const arrayFieldIndex = type.fields.findIndex(isCollaborativeArrayField);
    if (arrayFieldIndex === -1) return;
    const arrayField = type.fields[arrayFieldIndex];
    if (!arrayField) return;
    issues.push({
      code: 'operational_conflict_token_missing',
      severity: 'warning',
      path: `types.${typeIndex}.fields.${arrayFieldIndex}`,
      message: `${type.name}.${arrayField.name} is a shared-looking array on a table with updatedAt but no conflict token.`,
      hint: 'For offline or optimistic edits, add a version/revision/etag field or move independently edited array items into scoped child rows.',
    });
  });
  return issues;
}

function checkNotificationAdvice(schema: Schema): SemanticIssueDraft[] {
  if (!mentionsNotificationCapability(schema)) return [];
  const objects = schema.types.filter((type): type is ObjectType => type.kind === 'object');
  if (objects.some(isNotificationStateType) && objects.some(isNotificationEndpointType)) return [];

  return [
    {
      code: 'operational_notification_model_missing',
      severity: 'warning',
      path: 'types',
      message:
        'The model notes mention outbound reminders, notifications, or push, but notification state is incomplete.',
      hint: 'If outbound notifications are in scope, model delivery endpoints and preferences, such as UserDevice, NotificationPreference, ScheduledNotification, or NotificationDelivery.',
    },
  ];
}

function hasTimezoneField(type: ObjectType): boolean {
  return type.fields.some((field) => {
    if (/^(timeZoneId|timezone|timeZone)$/u.test(field.name)) return true;
    return field.type.kind === 'ref' && field.type.typeName === 'place.TimeZoneId';
  });
}

function isHouseholdScoped(type: ObjectType): boolean {
  if (type.name === 'Household') return true;
  return type.fields.some((field) => field.name === 'householdId');
}

function isHouseholdLocalTemporalField(field: ObjectType['fields'][number]): boolean {
  const haystack = `${field.name} ${field.description ?? ''}`.toLowerCase();
  if (field.name === 'createdAt' || field.name === 'updatedAt') return false;
  return (
    /(expires|expiry|expired|suppresseduntil|scheduled|reminder|notify|planned|weekstart|weekboundary|today|localdate)/u.test(
      haystack,
    ) ||
    (field.type.kind === 'date' && /(expires|planned|scheduled|week|reminder)/u.test(haystack))
  );
}

function isInboundDeliveryStateType(type: ObjectType): boolean {
  return /(InboundMessage|WebhookEvent|WebhookDelivery|MessageDelivery|ConversationSession|PendingIntent|PendingConfirmation)/u.test(
    type.name,
  );
}

function isLikelyClientSurfaceEnum(
  enumName: string,
  field: ObjectType['fields'][number],
  owner: ObjectType,
  schema: Schema,
): boolean {
  const surfaceText = `${schema.metadata?.description ?? ''} ${owner.description ?? ''} ${
    field.description ?? ''
  }`.toLowerCase();
  const names = `${owner.name} ${field.name} ${enumName}`;
  const clientSurface = /\b(client|mobile|web|api|surface)\b/u.test(surfaceText);
  if (
    clientSurface &&
    /^(.*Status|Equipment|CookingMethod|Allergen|DietaryProfile)$/u.test(enumName)
  ) {
    return true;
  }
  return /^(Equipment|CookingMethod|Allergen|DietaryProfile)$/u.test(names);
}

function hasUpdatedAtField(type: ObjectType): boolean {
  return type.fields.some((field) => field.name === 'updatedAt');
}

function hasConflictTokenField(type: ObjectType): boolean {
  return type.fields.some((field) =>
    /^(version|revision|etag|rowVersion|lockVersion)$/u.test(field.name),
  );
}

function isCollaborativeArrayField(field: ObjectType['fields'][number]): boolean {
  if (field.type.kind !== 'array') return false;
  return /^(items|listItems|meals|tasks|todos|entries|shoppingItems|planMeals)$/u.test(field.name);
}

function mentionsNotificationCapability(schema: Schema): boolean {
  const text = [
    schema.metadata?.name,
    schema.metadata?.description,
    ...schema.types.map((type) => type.description),
    ...schema.types.flatMap((type) =>
      type.kind === 'object' ? type.fields.map((field) => field.description) : [],
    ),
  ]
    .filter((item): item is string => Boolean(item))
    .join(' ')
    .toLowerCase();
  return /\b(push|notification|notifications|notify|reminder|reminders|expiry warning|expiry warnings)\b/u.test(
    text,
  );
}

function isNotificationStateType(type: ObjectType): boolean {
  return /(ScheduledNotification|NotificationDelivery|NotificationJob|Reminder)/u.test(type.name);
}

function isNotificationEndpointType(type: ObjectType): boolean {
  return /(UserDevice|DeviceToken|PushSubscription|NotificationPreference|OutboundChannel)/u.test(
    type.name,
  );
}

function dedupeIssues(issues: SemanticIssueDraft[]): SemanticIssueDraft[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const key = (i: SemanticIssue) => `${i.severity}|${i.code}|${i.path}|${i.message}`;
  const seen = new Set(pre.map(key));
  return post.filter((i) => !seen.has(key(i)));
}
