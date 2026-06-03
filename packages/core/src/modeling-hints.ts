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
  | 'stringly_ref';

export type ModelingSignal =
  | 'identity_pressure'
  | 'query_pressure'
  | 'derivation_pressure'
  | 'embedded_collection_pressure'
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

const QUERY_HANDLE_NAME = /(^|_)(kind|state|status|slug|key)$|name$|searchtext$|date$|at$|year$/i;

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
  return {
    id: hintId('embedded_collection', ownerType.name, field.name, [elementType.name]),
    kind: 'embedded_collection',
    signals: ['embedded_collection_pressure', 'relationship_pressure'],
    path,
    typeName: ownerType.name,
    fieldName: field.name,
    title: 'Embedded collection',
    message: `This field stores a collection of ${elementType.name} objects. Keep it embedded if the items only belong to ${ownerType.name}. Consider a table if items need independent lifecycle, reuse, or querying.`,
    rationale:
      'Arrays are a good fit for owned child data, but shared or independently queried items often want table identity.',
    fieldNames: [field.name],
  };
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
