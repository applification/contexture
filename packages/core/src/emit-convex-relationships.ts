import type { FieldType, Schema, TypeDef } from './ir';

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

interface Relationship {
  name: string;
  fromType: string;
  fromTable: string;
  fromField: string;
  fromPath: string[];
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
  fromPath: string[];
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
      collectRelationshipsForType({
        root: owner,
        type: field.type,
        byName,
        relationships,
        path: [field.name],
        cardinality: 'one',
        optional: field.optional === true,
        nullable: field.nullable === true,
        visitedEmbeds: new Set([owner.name]),
      });
    }
  }

  return relationships.sort((a, b) => a.name.localeCompare(b.name));
}

function collectRelationshipsForType(args: {
  root: ObjectType;
  type: FieldType;
  byName: ReadonlyMap<string, ObjectType>;
  relationships: Relationship[];
  path: string[];
  cardinality: 'one' | 'many';
  optional: boolean;
  nullable: boolean;
  visitedEmbeds: ReadonlySet<string>;
}): void {
  const {
    root,
    type,
    byName,
    relationships,
    path,
    cardinality,
    optional,
    nullable,
    visitedEmbeds,
  } = args;

  if (type.kind === 'array') {
    collectRelationshipsForType({
      ...args,
      type: type.element,
      path: [...path, '[]'],
      cardinality: 'many',
    });
    return;
  }

  if (type.kind !== 'ref') return;

  const target = byName.get(type.typeName);
  if (!target) return;

  if (target.table === true) {
    const relationship = type.relationship;
    const ownership = relationship?.ownership;
    const fromField = leafField(path);
    relationships.push({
      name: relationship?.name ?? `${root.name}.${formatPath(path)}`,
      fromType: root.name,
      fromTable: tableName(root),
      fromField,
      fromPath: path,
      toType: target.name,
      toTable: tableName(target),
      cardinality,
      optional,
      nullable,
      onDelete: relationship?.onDelete ?? 'none',
      ownershipScopeField: ownership?.scopeField ?? null,
      targetOwnershipScopeField: ownership?.targetScopeField ?? ownership?.scopeField ?? null,
    });
    return;
  }

  if (visitedEmbeds.has(target.name)) return;
  const nextVisited = new Set(visitedEmbeds);
  nextVisited.add(target.name);
  for (const field of target.fields) {
    collectRelationshipsForType({
      root,
      type: field.type,
      byName,
      relationships,
      path: [...path, field.name],
      cardinality,
      optional: optional || field.optional === true,
      nullable: nullable || field.nullable === true,
      visitedEmbeds: nextVisited,
    });
  }
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
    `  const ids = collectContexturePathValues(input, relationship.fromPath);`,
    `  for (const id of ids) {`,
    `    if (id === undefined || id === null) continue;`,
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
    '',
    `function collectContexturePathValues(value: unknown, path: readonly string[]): unknown[] {`,
    `  if (path.length === 0) return [value];`,
    `  const [segment, ...rest] = path;`,
    `  if (segment === '[]') {`,
    `    if (!Array.isArray(value)) return [];`,
    `    return value.flatMap((item) => collectContexturePathValues(item, rest));`,
    `  }`,
    `  if (!isContextureRecord(value)) return [];`,
    `  return collectContexturePathValues(value[segment], rest);`,
    `}`,
    '',
    `function isContextureRecord(value: unknown): value is Record<string, unknown> {`,
    `  return typeof value === 'object' && value !== null && !Array.isArray(value);`,
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

function isObjectType(type: TypeDef): type is ObjectType {
  return type.kind === 'object';
}

function leafField(path: readonly string[]): string {
  return [...path].reverse().find((segment) => segment !== '[]') ?? '';
}

function formatPath(path: readonly string[]): string {
  return path.join('.');
}

function tableName(type: ObjectType): string {
  return type.tableName ?? `${type.name.charAt(0).toLowerCase()}${type.name.slice(1)}`;
}
