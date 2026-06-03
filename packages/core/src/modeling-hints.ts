import { derivationKindLabel } from './derivation';
import type { FieldDef, FieldType, Schema, TypeDef } from './ir';

export const MODELING_HINT_ANALYZER_VERSION = 1;

export type ModelingHintKind =
  | 'owned_value_object'
  | 'possible_entity'
  | 'query_handle'
  | 'derivation_policy'
  | 'embedded_collection'
  | 'stdlib_type'
  | 'stringly_ref'
  | 'bounded_scan'
  | 'alias_lookup'
  | 'merge_semantics';

export type ModelingSignal =
  | 'identity_pressure'
  | 'query_pressure'
  | 'derivation_pressure'
  | 'embedded_collection_pressure'
  | 'concurrency_pressure'
  | 'document_size_pressure'
  | 'lifecycle_pressure'
  | 'relationship_pressure';

export interface ModelingHint {
  id: string;
  kind: ModelingHintKind;
  signals: ModelingSignal[];
  path: string;
  typeName: string;
  fieldName?: string;
  title: string;
  message: string;
  rationale: string;
  fieldNames: string[];
  action?: ModelingHintAction;
}

export type ModelingHintAction =
  | {
      kind: 'use_stdlib_type';
      typeName: string;
    }
  | {
      kind: 'convert_to_ref';
      typeName: string;
    };

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

interface TypeUsage {
  ownerTypeName: string;
  fieldName: string;
  collection: boolean;
}

interface EmbeddedCollectionPressure {
  concurrentEditing: boolean;
  documentSize: boolean;
}

const QUERY_HANDLE_NAME = /(^|_)(kind|state|status|slug|key)$|name$|searchtext$|date$|at$|year$/i;
const ARRAY_FILTER_FIELD_NAME =
  /(^|_)(tags?|labels?|categories|cuisines?|cuisineIds|mealTypes?|methods?|cookingMethods?|equipment|dietary|dietarySuitability|allergens?|ingredientIds|aliases)$|Ids$/i;

const COLLABORATIVE_COLLECTION_FIELD_NAMES = new Set([
  'entries',
  'items',
  'listItems',
  'meals',
  'planMeals',
  'tasks',
  'todos',
]);

const MUTABLE_CHILD_FIELD_NAME = /(^|_)(checked|completed|done|status|state|cooked|purchased)$/i;

const HEAVY_CHILD_FIELD_NAME =
  /(^|_)(audio|audioUrl|storageId|media|image|imageUrl|snapshot|nutrition|transcript|payload|content)$/i;

const IDENTITY_FIELD_NAMES = new Set([
  'id',
  'name',
  'slug',
  'email',
  'externalId',
  'storageId',
  'catalogNumber',
  'url',
  'key',
]);

export function analyzeModelingHints(schema: Schema): ModelingHint[] {
  const objects = schema.types.filter(isObjectType);
  const byName = new Map(schema.types.map((type) => [type.name, type]));
  const usages = collectTypeUsages(objects);
  const hints: ModelingHint[] = [];

  objects.forEach((type, typeIndex) => {
    const typePath = `types.${typeIndex}`;
    const isTable = type.table === true;
    const typeUsages = usages.get(type.name) ?? [];

    if (!isTable) {
      const identityFields = type.fields.filter(isIdentityLikeField);
      if (identityFields.length > 0) {
        hints.push(
          possibleEntityHint({
            type,
            path: typePath,
            identityFields,
            ownerName: ownerLabel(typeUsages),
          }),
        );
      } else if (looksOwnedValueObject(type, typeUsages)) {
        hints.push(ownedValueObjectHint(type, typePath, ownerLabel(typeUsages)));
      }
    }

    type.fields.forEach((field, fieldIndex) => {
      const fieldPath = `${typePath}.fields.${fieldIndex}`;
      const refTarget = unwrapRefTarget(field.type);
      if (field.type.kind === 'array' && refTarget) {
        const target = byName.get(refTarget);
        if (target?.kind === 'object') {
          hints.push(embeddedCollectionHint(type, field, fieldPath, target));
        }
      }

      if (isTable && isQueryHandleField(field, type)) {
        hints.push(queryHandleHint(type, field, fieldPath));
      }

      const boundedScanHint = fieldBoundedScanHint(type, field, fieldPath);
      if (boundedScanHint) hints.push(boundedScanHint);

      const aliasHint = fieldAliasLookupHint(type, field, fieldPath);
      if (aliasHint) hints.push(aliasHint);

      const mergeHint = fieldMergeSemanticsHint(type, field, fieldPath);
      if (mergeHint) hints.push(mergeHint);

      const derivationHint = fieldDerivationHint(type, field, fieldPath);
      if (derivationHint) hints.push(derivationHint);

      const stdlibHint = stdlibTypeHint(type, field, fieldPath);
      if (stdlibHint) hints.push(stdlibHint);

      const refHint = stringlyRefHint(schema, type, field, fieldPath);
      if (refHint) hints.push(refHint);
    });
  });

  return hints;
}

function fieldDerivationHint(type: ObjectType, field: FieldDef, path: string): ModelingHint | null {
  const derivation = field.derivation;
  if (!derivation) return null;

  const label = derivationKindLabel(derivation.kind);
  const sourceCount = derivation.sources?.length ?? 0;
  if (derivation.kind === 'snapshot') {
    return {
      id: hintId('derivation_policy', type.name, field.name, [derivation.kind]),
      kind: 'derivation_policy',
      signals: ['derivation_pressure'],
      path,
      typeName: type.name,
      fieldName: field.name,
      title: 'Snapshot field',
      message: `${field.name} is a frozen snapshot. Drift is expected unless the product needs a stale indicator.`,
      rationale:
        'Snapshots preserve historical context, so Contexture should document intent instead of warning by default.',
      fieldNames: [field.name],
    };
  }

  if (sourceCount === 0) {
    return {
      id: hintId('derivation_policy', type.name, field.name, [derivation.kind, 'sources']),
      kind: 'derivation_policy',
      signals: ['derivation_pressure'],
      path,
      typeName: type.name,
      fieldName: field.name,
      title: 'Derivation source missing',
      message: `${field.name} is marked as a ${label}, but no source fields are declared.`,
      rationale:
        'Source fields make invalidation and backfill responsibilities visible to app code reviewers.',
      fieldNames: [field.name],
    };
  }

  if (!derivation.refresh && !derivation.driftPolicy) {
    return {
      id: hintId('derivation_policy', type.name, field.name, [derivation.kind, 'refresh']),
      kind: 'derivation_policy',
      signals: ['derivation_pressure', 'lifecycle_pressure'],
      path,
      typeName: type.name,
      fieldName: field.name,
      title: 'Drift policy missing',
      message: `${field.name} is stored from ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'} without a refresh or drift policy.`,
      rationale:
        'A stored derived value needs an explicit recompute cadence, stale behavior, or intentional drift policy.',
      fieldNames: [field.name],
    };
  }

  return {
    id: hintId('derivation_policy', type.name, field.name, [derivation.kind, 'declared']),
    kind: 'derivation_policy',
    signals: ['derivation_pressure'],
    path,
    typeName: type.name,
    fieldName: field.name,
    title: 'Derivation policy',
    message: `${field.name} is a ${label} with declared source and freshness policy.`,
    rationale:
      'Documented derivation lets Contexture surface intent without treating normal denormalization as a bug.',
    fieldNames: [field.name],
  };
}

function stringlyRefHint(
  schema: Schema,
  type: ObjectType,
  field: FieldDef,
  path: string,
): ModelingHint | null {
  if (!isStringlyRefField(field)) return null;
  const targetNames = targetTypeNameCandidatesForRefField(field.name);
  const target = schema.types
    .filter(isObjectType)
    .find((candidate) => candidate.table === true && targetNames.includes(candidate.name));
  if (!target) return null;

  return {
    id: hintId('stringly_ref', type.name, field.name, [target.name]),
    kind: 'stringly_ref',
    signals: ['relationship_pressure'],
    path,
    typeName: type.name,
    fieldName: field.name,
    title: 'Stringly reference',
    message: `${field.name} looks like a Convex id for ${target.name}. Convert it to a ref so generated validators emit v.id("${convexTableName(target)}").`,
    rationale:
      'Refs preserve the target type in Contexture and give Convex generated schemas table-tagged id validation.',
    fieldNames: [field.name],
    action: { kind: 'convert_to_ref', typeName: target.name },
  };
}

function possibleEntityHint({
  type,
  path,
  identityFields,
  ownerName,
}: {
  type: ObjectType;
  path: string;
  identityFields: FieldDef[];
  ownerName?: string;
}): ModelingHint {
  const fieldNames = identityFields.map((field) => field.name);
  const belongsTo = ownerName
    ? ` if it only belongs to ${ownerName}`
    : ' if it only belongs to its parent record';
  return {
    id: hintId('possible_entity', type.name, undefined, fieldNames),
    kind: 'possible_entity',
    signals: ['identity_pressure'],
    path,
    typeName: type.name,
    title: 'Possible entity',
    message: `This embedded object has identity-like fields. Keep it embedded${belongsTo}. Consider a table if users need to browse, edit, reuse, or link it independently.`,
    rationale:
      'Identity-like fields often become useful handles when a concept gains its own lifecycle.',
    fieldNames,
  };
}

function ownedValueObjectHint(
  type: ObjectType,
  path: string,
  ownerName: string | undefined,
): ModelingHint {
  const parent = ownerName ? ` to ${ownerName}` : ' to its parent record';
  return {
    id: hintId('owned_value_object', type.name),
    kind: 'owned_value_object',
    signals: [],
    path,
    typeName: type.name,
    title: 'Owned value object',
    message: `This object appears to belong entirely${parent}. Embedding is a good fit while it has no independent identity or lifecycle.`,
    rationale:
      'Owned structure can stay close to the parent record instead of becoming a table too early.',
    fieldNames: [],
  };
}

function embeddedCollectionHint(
  ownerType: ObjectType,
  field: FieldDef,
  path: string,
  elementType: ObjectType,
): ModelingHint {
  const pressure = embeddedCollectionPressure(ownerType, field, elementType);
  const signals: ModelingSignal[] = ['embedded_collection_pressure', 'relationship_pressure'];
  if (pressure.concurrentEditing) signals.push('concurrency_pressure');
  if (pressure.documentSize) signals.push('document_size_pressure');

  return {
    id: hintId('embedded_collection', ownerType.name, field.name, [elementType.name]),
    kind: 'embedded_collection',
    signals,
    path,
    typeName: ownerType.name,
    fieldName: field.name,
    title: pressure.concurrentEditing ? 'Collaborative embedded collection' : 'Embedded collection',
    message: embeddedCollectionMessage(ownerType, field, elementType, pressure),
    rationale: embeddedCollectionRationale(pressure),
    fieldNames: [field.name],
  };
}

function embeddedCollectionMessage(
  ownerType: ObjectType,
  field: FieldDef,
  elementType: ObjectType,
  pressure: EmbeddedCollectionPressure,
): string {
  if (pressure.concurrentEditing) {
    return `This field stores mutable ${elementType.name} rows inside ${ownerType.name}. Consider a table when people may edit individual ${field.name} from multiple surfaces: row identity avoids whole-array lost updates, gives commands a stable child id, and makes Convex indexes possible.`;
  }

  if (pressure.documentSize) {
    return `This field stores a potentially heavy collection of ${elementType.name} objects. Keep it embedded if the items are read-mostly and owned by ${ownerType.name}; consider a table if snapshots, media, or generated payloads could push document size or need targeted queries.`;
  }

  return `This field stores a collection of ${elementType.name} objects. Keep it embedded if the items only belong to ${ownerType.name}. Consider a table if items need independent lifecycle, stable ids, concurrent edits, reuse, or querying.`;
}

function embeddedCollectionRationale(pressure: EmbeddedCollectionPressure): string {
  if (pressure.concurrentEditing) {
    return 'Convex array elements are not independently addressable or indexable, so collaborative item edits are safer as scoped child table rows.';
  }
  if (pressure.documentSize) {
    return 'Embedded arrays are convenient, but repeated snapshots, media, and generated payloads can grow the parent document and limit query handles.';
  }
  return 'Arrays are a good fit for owned child data, but shared or independently queried items often want table identity.';
}

function embeddedCollectionPressure(
  ownerType: ObjectType,
  field: FieldDef,
  elementType: ObjectType,
): EmbeddedCollectionPressure {
  const concurrentEditing =
    ownerType.table === true &&
    (COLLABORATIVE_COLLECTION_FIELD_NAMES.has(field.name) ||
      elementType.fields.some((childField) => MUTABLE_CHILD_FIELD_NAME.test(childField.name)));

  const documentSize = elementType.fields.some((childField) => {
    if (childField.derivation?.kind === 'snapshot') return true;
    return HEAVY_CHILD_FIELD_NAME.test(childField.name);
  });

  return { concurrentEditing, documentSize };
}

function queryHandleHint(type: ObjectType, field: FieldDef, path: string): ModelingHint {
  return {
    id: hintId('query_handle', type.name, field.name),
    kind: 'query_handle',
    signals: ['query_pressure'],
    path,
    typeName: type.name,
    fieldName: field.name,
    title: 'Query handle',
    message:
      'This field looks useful for filtering, sorting, indexing, or search. It can stay denormalized on the table as a query handle over embedded data.',
    rationale:
      'A top-level query handle can preserve an embedded shape while keeping common queries efficient.',
    fieldNames: [field.name],
  };
}

function fieldBoundedScanHint(
  type: ObjectType,
  field: FieldDef,
  path: string,
): ModelingHint | null {
  if (type.table !== true) return null;
  if (field.type.kind !== 'array') return null;
  if (!isArrayFilterField(field)) return null;

  const ownerAxis = boundedOwnerAxis(type);
  if (ownerAxis) {
    return {
      id: hintId('bounded_scan', type.name, field.name, [ownerAxis.name]),
      kind: 'bounded_scan',
      signals: ['query_pressure'],
      path,
      typeName: type.name,
      fieldName: field.name,
      title: 'Bounded array scan',
      message: `${field.name} can be filtered after an indexed ${ownerAxis.name} query, but Convex cannot use a normal index to find matching array elements.`,
      rationale:
        'Array-valued filters are acceptable when an owner-scoped query bounds the candidate set; global or cross-scope search needs a lookup table or another query handle.',
      fieldNames: [field.name, ownerAxis.name],
    };
  }

  return {
    id: hintId('bounded_scan', type.name, field.name, ['unbounded']),
    kind: 'bounded_scan',
    signals: ['query_pressure'],
    path,
    typeName: type.name,
    fieldName: field.name,
    title: 'Unbounded array filter',
    message: `${field.name} looks like an array filter, but Convex cannot use a normal index to find matching array elements.`,
    rationale:
      'Without a tenant, household, or workspace scope field to bound the scan, array filters usually need a normalized lookup table for production-scale queries.',
    fieldNames: [field.name],
  };
}

function fieldAliasLookupHint(
  type: ObjectType,
  field: FieldDef,
  path: string,
): ModelingHint | null {
  if (field.name !== 'aliases') return null;
  if (!isArrayOfStrings(field.type)) return null;
  const identityFields = type.fields.filter(
    (candidate) =>
      candidate.name !== field.name &&
      (isIdentityLikeField(candidate) || /^(canonicalName|displayName)$/u.test(candidate.name)),
  );

  return {
    id: hintId(
      'alias_lookup',
      type.name,
      field.name,
      identityFields.map((item) => item.name),
    ),
    kind: 'alias_lookup',
    signals: ['identity_pressure', 'query_pressure'],
    path,
    typeName: type.name,
    fieldName: field.name,
    title: 'Alias lookup scan',
    message: `${type.name}.${field.name} stores aliases in an array, so alias resolution needs a scan unless the app maintains a normalized lookup table.`,
    rationale:
      'Canonical catalog entities often need fast alias resolution from user text. A table such as IngredientAliasLookup or CuisineAliasLookup makes that query indexable.',
    fieldNames: [field.name, ...identityFields.map((item) => item.name)],
  };
}

function fieldMergeSemanticsHint(
  type: ObjectType,
  field: FieldDef,
  path: string,
): ModelingHint | null {
  if (field.name !== 'aliases') return null;
  if (!isArrayOfStrings(field.type)) return null;
  if (hasMergePointer(type)) return null;

  return {
    id: hintId('merge_semantics', type.name, field.name),
    kind: 'merge_semantics',
    signals: ['identity_pressure', 'relationship_pressure'],
    path,
    typeName: type.name,
    fieldName: field.name,
    title: 'Merge state missing',
    message: `${type.name} has aliases but no merged-into pointer, so duplicate enrichment records need a bespoke repoint routine.`,
    rationale:
      'A nullable mergedInto ref makes canonicalization explicit in the model even though app code still owns data migration and reference repointing.',
    fieldNames: [field.name],
  };
}

function stdlibTypeHint(type: ObjectType, field: FieldDef, path: string): ModelingHint | null {
  if (unwrapRefTarget(field.type)) return null;
  if (field.type.kind !== 'string' && field.type.kind !== 'number') return null;

  const target = stdlibTargetForField(field);
  if (!target) return null;

  return {
    id: hintId('stdlib_type', type.name, field.name, [target.typeName]),
    kind: 'stdlib_type',
    signals: ['identity_pressure'],
    path,
    typeName: type.name,
    fieldName: field.name,
    title: 'Stdlib type available',
    message: `${field.name} looks like ${target.label}. Use ${target.typeName} to reuse the shared validator and generated type.`,
    rationale:
      'Stdlib refs keep common value formats consistent across the model, generated validators, and agent-created changes.',
    fieldNames: [field.name],
    action: { kind: 'use_stdlib_type', typeName: target.typeName },
  };
}

function collectTypeUsages(objects: ObjectType[]): Map<string, TypeUsage[]> {
  const usages = new Map<string, TypeUsage[]>();
  for (const owner of objects) {
    for (const field of owner.fields) {
      const target = unwrapRefTarget(field.type);
      if (!target) continue;
      const existing = usages.get(target) ?? [];
      existing.push({
        ownerTypeName: owner.name,
        fieldName: field.name,
        collection: field.type.kind === 'array',
      });
      usages.set(target, existing);
    }
  }
  return usages;
}

function looksOwnedValueObject(type: ObjectType, usages: TypeUsage[]): boolean {
  if (type.fields.length === 0) return false;
  if (usages.length > 1) return false;
  return type.fields.every((field) => {
    const target = unwrapRefTarget(field.type);
    if (target) return true;
    return !isIdentityLikeField(field) && field.type.kind !== 'array';
  });
}

function isQueryHandleField(field: FieldDef, type: ObjectType): boolean {
  if ((type.indexes ?? []).some((index) => index.fields.includes(field.name))) return true;
  if (QUERY_HANDLE_NAME.test(field.name)) return true;
  const description = field.description?.toLowerCase() ?? '';
  return (
    description.includes('denormalized') ||
    description.includes('filter') ||
    description.includes('search') ||
    description.includes('index')
  );
}

function isIdentityLikeField(field: FieldDef): boolean {
  const fieldName = field.name;
  if (IDENTITY_FIELD_NAMES.has(fieldName)) return true;
  if (/(^|[a-z])(Id|Name|StorageId)$/.test(fieldName)) return true;
  if (field.type.kind === 'string') {
    return (
      field.type.format === 'email' || field.type.format === 'url' || field.type.format === 'uuid'
    );
  }
  return false;
}

function isStringlyRefField(field: FieldDef): boolean {
  if (field.type.kind === 'string') return singularRefName(field.name) !== null;
  if (field.type.kind === 'array' && field.type.element.kind === 'string') {
    return singularRefName(field.name) !== null;
  }
  return false;
}

function isArrayFilterField(field: FieldDef): boolean {
  const description = field.description?.toLowerCase() ?? '';
  return (
    ARRAY_FILTER_FIELD_NAME.test(field.name) ||
    description.includes('filter') ||
    description.includes('search') ||
    description.includes('facet')
  );
}

function isArrayOfStrings(type: FieldType): boolean {
  return type.kind === 'array' && type.element.kind === 'string';
}

function boundedOwnerAxis(type: ObjectType): FieldDef | null {
  const indexedFieldNames = new Set(
    (type.indexes ?? [])
      .filter((index) => index.fields.length > 0)
      .map((index) => index.fields[0])
      .filter((field): field is string => Boolean(field)),
  );
  return (
    type.fields.find((field) => indexedFieldNames.has(field.name) && isLikelyOwnerAxis(field)) ??
    type.fields.find(isLikelyOwnerAxis) ??
    null
  );
}

function isLikelyOwnerAxis(field: FieldDef): boolean {
  if (!/^(household|tenant|org|organization|workspace|account|team|project)Id$/u.test(field.name)) {
    return false;
  }
  return field.optional !== true && field.nullable !== true;
}

function hasMergePointer(type: ObjectType): boolean {
  return type.fields.some((field) => {
    if (!/^mergedInto[A-Z].*Id$/u.test(field.name)) return false;
    return field.type.kind === 'ref' || (field.type.kind === 'string' && field.nullable === true);
  });
}

function targetTypeNameCandidatesForRefField(fieldName: string): string[] {
  const singular = singularRefName(fieldName);
  if (!singular) return [];
  const pascal = singular
    .split(/(?=[A-Z])/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
  const parts = pascal.split(/(?=[A-Z])/u).filter((part) => part.length > 0);
  const candidates: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    candidates.push(parts.slice(i).join(''));
  }
  return [...new Set(candidates)];
}

function singularRefName(fieldName: string): string | null {
  if (fieldName.endsWith('Ids') && fieldName.length > 'Ids'.length) {
    return fieldName.slice(0, -'Ids'.length);
  }
  if (fieldName.endsWith('Id') && fieldName.length > 'Id'.length) {
    return fieldName.slice(0, -'Id'.length);
  }
  return null;
}

function stdlibTargetForField(field: FieldDef): { typeName: string; label: string } | null {
  const name = field.name.toLowerCase();
  const description = field.description?.toLowerCase() ?? '';
  const haystack = `${name} ${description}`;

  if (field.type.kind === 'string') {
    if (field.type.format === 'email' || /\bemail\b/u.test(haystack)) {
      return { typeName: 'common.Email', label: 'an email address' };
    }
    if (
      field.type.format === 'url' ||
      /\b(url|uri|website|webpage|link|imageurl|avatarurl|coverimage)\b/u.test(haystack)
    ) {
      return { typeName: 'common.URL', label: 'a URL' };
    }
    if (field.type.format === 'uuid' || /\buuid\b/u.test(haystack)) {
      return { typeName: 'common.UUID', label: 'a UUID' };
    }
    if (/\b(datetime|timestamp|instant|occurredat|createdat|updatedat)\b/u.test(haystack)) {
      return { typeName: 'common.ISODateTime', label: 'an ISO timestamp' };
    }
    if (
      name.includes('date') ||
      /\b(iso)?date\b/u.test(haystack) ||
      /(bornon|releasedon)$/u.test(name)
    ) {
      return { typeName: 'common.ISODate', label: 'an ISO date' };
    }
    if (/\bslug\b/u.test(haystack)) {
      return { typeName: 'common.Slug', label: 'a slug' };
    }
    if (/\bcountry(code)?\b/u.test(haystack)) {
      return { typeName: 'place.CountryCode', label: 'a country code' };
    }
    if (/\bcurrency(code)?\b/u.test(haystack)) {
      return { typeName: 'money.CurrencyCode', label: 'a currency code' };
    }
    if (/\b(phone|telephone|mobile)\b/u.test(haystack)) {
      return { typeName: 'contact.PhoneNumber', label: 'a phone number' };
    }
    if (/\b(name|title|label)\b/u.test(haystack) && field.type.min === 1) {
      return { typeName: 'common.NonEmptyString', label: 'non-empty text' };
    }
  }

  if (field.type.kind === 'number') {
    if (/\b(price|amount|cost|total|subtotal|balance|money)\b/u.test(haystack)) {
      return { typeName: 'money.Money', label: 'a money amount' };
    }
    if (field.type.int === true && field.type.min !== undefined && field.type.min >= 1) {
      return { typeName: 'common.PositiveInt', label: 'a positive integer' };
    }
    if (field.type.min !== undefined && field.type.min > 0) {
      return { typeName: 'common.PositiveNumber', label: 'a positive number' };
    }
  }

  return null;
}

function unwrapRefTarget(type: FieldType): string | undefined {
  let current = type;
  while (current.kind === 'array') current = current.element;
  return current.kind === 'ref' ? current.typeName : undefined;
}

function ownerLabel(usages: TypeUsage[]): string | undefined {
  if (usages.length !== 1) return undefined;
  return usages[0]?.ownerTypeName;
}

function isObjectType(type: TypeDef): type is ObjectType {
  return type.kind === 'object';
}

function convexTableName(type: ObjectType): string {
  return type.tableName ?? `${type.name.charAt(0).toLowerCase()}${type.name.slice(1)}`;
}

function hintId(
  kind: ModelingHintKind,
  typeName: string,
  fieldName?: string,
  fieldNames = [] as string[],
): string {
  return [`v${MODELING_HINT_ANALYZER_VERSION}`, kind, typeName, fieldName, ...fieldNames]
    .filter((part): part is string => Boolean(part))
    .join(':');
}
