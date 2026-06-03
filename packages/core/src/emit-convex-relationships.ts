import type { FieldType, Schema, TypeDef } from './ir';

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

interface Relationship {
  name: string;
  fromType: string;
  fromTable: string;
  fromField: string;
  toType: string;
  toTable: string;
  cardinality: 'one' | 'many';
  optional: boolean;
  nullable: boolean;
  onDelete: 'none' | 'restrict' | 'cascade' | 'setNull';
  ownershipScopeField: string | null;
  targetOwnershipScopeField: string | null;
}

function banner(sourcePath?: string): string {
  const base = '// @contexture-generated — do not edit by hand. Regenerated on every IR save.';
  return sourcePath ? `${base} Source: ${sourcePath}` : base;
}

export function emitConvexRelationships(schema: Schema, sourcePath?: string): string {
  const relationships = collectRelationships(schema);
  return [
    banner(sourcePath),
    '',
    `import type { AnyDataModel, GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server';`,
    `import type { GenericId } from 'convex/values';`,
    '',
    `export type ContextureRelationship = ${relationshipType()};`,
    '',
    `export const relationships = ${JSON.stringify(relationships, null, 2)} as const satisfies readonly ContextureRelationship[];`,
    '',
    ...assertionHelpers(relationships),
    '',
    ...deleteHelpers(relationships),
  ].join('\n');
}

function relationshipType(): string {
  return `{
  name: string;
  fromType: string;
  fromTable: string;
  fromField: string;
  toType: string;
  toTable: string;
  cardinality: 'one' | 'many';
  optional: boolean;
  nullable: boolean;
  onDelete: 'none' | 'restrict' | 'cascade' | 'setNull';
  ownershipScopeField: string | null;
  targetOwnershipScopeField: string | null;
}`;
}

function collectRelationships(schema: Schema): Relationship[] {
  const objects = schema.types.filter(isObjectType);
  const byName = new Map(objects.map((type) => [type.name, type]));
  const relationships: Relationship[] = [];

  for (const owner of objects) {
    if (owner.table !== true) continue;
    for (const field of owner.fields) {
      const ref = unwrapRef(field.type);
      if (!ref) continue;
      const target = byName.get(ref.typeName);
      if (!target || target.table !== true) continue;
      const relationship = ref.relationship;
      relationships.push({
        name: relationship?.name ?? `${owner.name}.${field.name}`,
        fromType: owner.name,
        fromTable: tableName(owner),
        fromField: field.name,
        toType: target.name,
        toTable: tableName(target),
        cardinality: ref.cardinality,
        optional: field.optional === true,
        nullable: field.nullable === true,
        onDelete: relationship?.onDelete ?? 'none',
        ownershipScopeField: relationship?.ownership?.scopeField ?? null,
        targetOwnershipScopeField:
          relationship?.ownership?.targetScopeField ?? relationship?.ownership?.scopeField ?? null,
      });
    }
  }

  return relationships.sort((a, b) => a.name.localeCompare(b.name));
}

function assertionHelpers(relationships: Relationship[]): string[] {
  const lines = [
    `type ContextureSource = Record<string, unknown>;`,
    '',
    `export async function assertContextureRefs(`,
    `  db: GenericDatabaseReader<AnyDataModel>,`,
    `  table: string,`,
    `  input: ContextureSource,`,
    `): Promise<void> {`,
    `  for (const relationship of relationships) {`,
    `    if (relationship.fromTable !== table) continue;`,
    `    await assertRelationshipRef(db, relationship, input);`,
    `  }`,
    `}`,
    '',
    `async function assertRelationshipRef(`,
    `  db: GenericDatabaseReader<AnyDataModel>,`,
    `  relationship: ContextureRelationship,`,
    `  input: ContextureSource,`,
    `): Promise<void> {`,
    `  const value = input[relationship.fromField];`,
    `  if (value === undefined || value === null) return;`,
    `  const ids = Array.isArray(value) ? value : [value];`,
    `  for (const id of ids) {`,
    `    if (typeof id !== 'string') {`,
    `      throw new Error(\`\${relationship.fromField} must be a Convex document id string.\`);`,
    `    }`,
    `    const target = await db.get(id as GenericId<string>);`,
    `    if (!target) {`,
    `      throw new Error(\`\${relationship.fromField} references a missing \${relationship.toTable} document.\`);`,
    `    }`,
    `    if (!relationship.ownershipScopeField || !relationship.targetOwnershipScopeField) continue;`,
    `    const sourceScope = input[relationship.ownershipScopeField];`,
    `    const targetScope = target[relationship.targetOwnershipScopeField];`,
    `    if (sourceScope !== targetScope) {`,
    `      throw new Error(\`\${relationship.fromField} must reference a \${relationship.toTable} document in the same \${relationship.ownershipScopeField} scope.\`);`,
    `    }`,
    `  }`,
    `}`,
  ];

  if (relationships.length === 0) {
    lines.push('', `// No table-to-table refs are modeled yet.`);
  }
  return lines;
}

function deleteHelpers(relationships: Relationship[]): string[] {
  const lines = [
    `export async function deleteWithContextureRelations(`,
    `  db: GenericDatabaseWriter<AnyDataModel>,`,
    `  table: string,`,
    `  id: GenericId<string>,`,
    `): Promise<void> {`,
    `  for (const relationship of relationships) {`,
    `    if (relationship.toTable !== table) continue;`,
    `    if (relationship.onDelete === 'restrict') {`,
    `      throw new Error(\`Delete is restricted while \${relationship.fromTable} may reference this \${table} document.\`);`,
    `    }`,
    `    if (relationship.onDelete !== 'none') {`,
    `      throw new Error(\`Contexture relationship \${relationship.name} uses \${relationship.onDelete}; add an indexed app-specific cleanup query before deleting.\`);`,
    `    }`,
    `  }`,
    `  await db.delete(id);`,
    `}`,
  ];

  if (relationships.some((relationship) => relationship.onDelete !== 'none')) {
    lines.push(
      '',
      `export const contextureDeletePlans = relationships.filter((relationship) => relationship.onDelete !== 'none');`,
    );
  }
  return lines;
}

function unwrapRef(type: FieldType): {
  typeName: string;
  relationship: Extract<FieldType, { kind: 'ref' }>['relationship'];
  cardinality: 'one' | 'many';
} | null {
  if (type.kind === 'ref') {
    return { typeName: type.typeName, relationship: type.relationship, cardinality: 'one' };
  }
  if (type.kind === 'array' && type.element.kind === 'ref') {
    return {
      typeName: type.element.typeName,
      relationship: type.element.relationship,
      cardinality: 'many',
    };
  }
  return null;
}

function isObjectType(type: TypeDef): type is ObjectType {
  return type.kind === 'object';
}

function tableName(type: ObjectType): string {
  return type.tableName ?? `${type.name.charAt(0).toLowerCase()}${type.name.slice(1)}`;
}
