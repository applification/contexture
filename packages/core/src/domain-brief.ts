import type { FieldDef, FieldType, ObjectInvariant, Schema, TypeDef } from './ir';
import { analyzeModelingHints, type ModelingHint } from './modeling-hints';
import { checkSemantic, type SemanticIssue, type StdlibCatalog } from './semantic-validation';

export interface DomainBrief {
  version: 1;
  model: {
    name?: string;
    description?: string;
  };
  summary: {
    typeCount: number;
    tableCount: number;
    invariantCount: number;
    derivationCount: number;
    relationshipCount: number;
    queryContractCount: number;
    unresolvedDecisionCount: number;
  };
  declaredDecisions: DomainDecision[];
  unresolvedDecisions: DomainReviewItem[];
  modelingHints: ModelingHint[];
  semanticWarnings: SemanticIssue[];
}

export type DomainDecisionKind = 'invariant' | 'derivation' | 'relationship' | 'query';

export interface DomainDecision {
  id: string;
  kind: DomainDecisionKind;
  title: string;
  scope: string;
  path: string;
  statement: string;
}

export type DomainReviewSeverity = 'warning' | 'advisory';

export interface DomainReviewItem {
  id: string;
  kind: 'semantic_warning' | 'modeling_hint' | 'missing_relationship_policy';
  severity: DomainReviewSeverity;
  title: string;
  scope: string;
  path: string;
  message: string;
  rationale?: string;
  sourceId?: string;
}

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

export interface BuildDomainBriefOptions {
  stdlib?: StdlibCatalog;
}

export function buildDomainBrief(
  schema: Schema,
  options: BuildDomainBriefOptions = {},
): DomainBrief {
  const semanticWarnings = checkSemantic(schema, options.stdlib).filter(
    (issue) => issue.severity === 'warning',
  );
  const modelingHints = analyzeModelingHints(schema);
  const declaredDecisions = collectDeclaredDecisions(schema);
  const unresolvedDecisions = collectUnresolvedDecisions(schema, semanticWarnings, modelingHints);

  return {
    version: 1,
    model: {
      ...(schema.metadata?.name ? { name: schema.metadata.name } : {}),
      ...(schema.metadata?.description ? { description: schema.metadata.description } : {}),
    },
    summary: {
      typeCount: schema.types.length,
      tableCount: schema.types.filter((type) => type.kind === 'object' && type.table === true)
        .length,
      invariantCount: countInvariants(schema),
      derivationCount: countDerivations(schema),
      relationshipCount: collectRelationshipDecisions(schema).length,
      queryContractCount: collectQueryDecisions(schema).length,
      unresolvedDecisionCount: unresolvedDecisions.length,
    },
    declaredDecisions,
    unresolvedDecisions,
    modelingHints,
    semanticWarnings,
  };
}

function collectDeclaredDecisions(schema: Schema): DomainDecision[] {
  return [
    ...collectInvariantDecisions(schema),
    ...collectDerivationDecisions(schema),
    ...collectRelationshipDecisions(schema),
    ...collectQueryDecisions(schema),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

function collectInvariantDecisions(schema: Schema): DomainDecision[] {
  const decisions: DomainDecision[] = [];
  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object') return;
    (type.invariants ?? []).forEach((invariant, invariantIndex) => {
      decisions.push({
        id: `invariant:${type.name}:${invariant.name}`,
        kind: 'invariant',
        title: invariant.name,
        scope: type.name,
        path: `types.${typeIndex}.invariants.${invariantIndex}`,
        statement: invariant.description ?? invariantStatement(invariant),
      });
    });
  });
  return decisions;
}

function invariantStatement(invariant: ObjectInvariant): string {
  switch (invariant.kind) {
    case 'requiresWhen':
      return `${invariant.when.field}=${String(invariant.when.equals)} requires ${[
        ...(invariant.requires ?? []).map((field) => `${field} to be present`),
        ...(invariant.forbids ?? []).map((field) => `${field} to be absent`),
      ].join(', ')}.`;
    case 'exactlyOneOf':
      return `Exactly one of ${invariant.fields.join(', ')} must be present.`;
    case 'mutuallyExclusive':
      return `${invariant.fields.join(', ')} are mutually exclusive.`;
    case 'fieldPredicate':
      return `${invariant.field} must satisfy ${invariant.predicate.kind}.`;
    case 'uniqueInArray':
      return `${invariant.arrayField} must be unique by ${invariant.uniqueField}.`;
  }
}

function collectDerivationDecisions(schema: Schema): DomainDecision[] {
  const decisions: DomainDecision[] = [];
  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object') return;
    type.fields.forEach((field, fieldIndex) => {
      if (!field.derivation) return;
      const parts = [
        `${type.name}.${field.name} is ${field.derivation.kind}`,
        field.derivation.owner ? `owned by ${field.derivation.owner}` : null,
        field.derivation.refresh ? `refreshes ${field.derivation.refresh}` : null,
        field.derivation.driftPolicy ? `uses ${field.derivation.driftPolicy} drift policy` : null,
        (field.derivation.sources?.length ?? 0) > 0
          ? `from ${field.derivation.sources?.join(', ')}`
          : null,
      ].filter((part): part is string => Boolean(part));
      decisions.push({
        id: `derivation:${type.name}:${field.name}`,
        kind: 'derivation',
        title: `${type.name}.${field.name}`,
        scope: `${type.name}.${field.name}`,
        path: `types.${typeIndex}.fields.${fieldIndex}.derivation`,
        statement: `${parts.join('; ')}.`,
      });
    });
  });
  return decisions;
}

function collectRelationshipDecisions(schema: Schema): DomainDecision[] {
  const decisions: DomainDecision[] = [];
  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object' || type.table !== true) return;
    type.fields.forEach((field, fieldIndex) => {
      collectRelationshipFieldDecisions({
        decisions,
        rootType: type,
        rootTypeIndex: typeIndex,
        field,
        fieldIndex,
        path: `types.${typeIndex}.fields.${fieldIndex}.type`,
        fieldPath: field.name,
      });
    });
  });
  return decisions;
}

function collectRelationshipFieldDecisions(args: {
  decisions: DomainDecision[];
  rootType: ObjectType;
  rootTypeIndex: number;
  field: FieldDef;
  fieldIndex: number;
  path: string;
  fieldPath: string;
}): void {
  const { decisions, rootType, field, path, fieldPath } = args;
  const relationship = relationshipFromFieldType(field.type);
  if (relationship) {
    const ownership = relationship.relationship?.ownership;
    decisions.push({
      id: `relationship:${rootType.name}:${fieldPath}`,
      kind: 'relationship',
      title: `${rootType.name}.${fieldPath}`,
      scope: `${rootType.name}.${fieldPath}`,
      path,
      statement: [
        `References ${relationship.typeName}`,
        `on delete: ${relationship.relationship?.onDelete ?? 'none'}`,
        ownership
          ? `same-scope via ${ownership.scopeField}${
              ownership.targetScopeField ? ` -> ${ownership.targetScopeField}` : ''
            }`
          : relationship.relationship?.crossScope
            ? 'intentionally cross-scope'
            : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join('; '),
    });
  }
}

function relationshipFromFieldType(
  fieldType: FieldType,
): Extract<FieldType, { kind: 'ref' }> | null {
  if (fieldType.kind === 'ref' && fieldType.relationship) return fieldType;
  if (fieldType.kind === 'array') return relationshipFromFieldType(fieldType.element);
  return null;
}

function collectQueryDecisions(schema: Schema): DomainDecision[] {
  const decisions: DomainDecision[] = [];
  schema.types.forEach((type, typeIndex) => {
    if (type.kind !== 'object' || type.table !== true) return;
    (type.indexes ?? []).forEach((index, indexIndex) => {
      decisions.push({
        id: `query:index:${type.name}:${index.name}`,
        kind: 'query',
        title: `${type.name}.${index.name}`,
        scope: type.name,
        path: `types.${typeIndex}.indexes.${indexIndex}`,
        statement: `Indexed lookup over ${index.fields.join(', ')}.`,
      });
    });
    (type.searchIndexes ?? []).forEach((index, indexIndex) => {
      decisions.push({
        id: `query:search:${type.name}:${index.name}`,
        kind: 'query',
        title: `${type.name}.${index.name}`,
        scope: type.name,
        path: `types.${typeIndex}.searchIndexes.${indexIndex}`,
        statement: `Search index over ${index.searchField}${
          (index.filterFields?.length ?? 0) > 0
            ? ` filtered by ${index.filterFields?.join(', ')}`
            : ''
        }.`,
      });
    });
  });
  return decisions;
}

function collectUnresolvedDecisions(
  schema: Schema,
  semanticWarnings: SemanticIssue[],
  modelingHints: ModelingHint[],
): DomainReviewItem[] {
  const fromWarnings = semanticWarnings.map((issue) => ({
    id: `semantic:${issue.code}:${issue.path}`,
    kind: 'semantic_warning' as const,
    severity: 'warning' as const,
    title: issue.code,
    scope: scopeFromPath(schema, issue.path),
    path: issue.path,
    message: issue.hint ? `${issue.message} ${issue.hint}` : issue.message,
    sourceId: issue.code,
  }));
  const fromHints = modelingHints
    .filter((hint) => hint.signals.length > 0)
    .map((hint) => ({
      id: `hint:${hint.id}`,
      kind: 'modeling_hint' as const,
      severity: hint.signals.some(isHighPressureSignal)
        ? ('warning' as const)
        : ('advisory' as const),
      title: hint.title,
      scope: hint.fieldName ? `${hint.typeName}.${hint.fieldName}` : hint.typeName,
      path: hint.path,
      message: hint.message,
      rationale: hint.rationale,
      sourceId: hint.id,
    }));
  return dedupeReviewItems([...fromWarnings, ...fromHints]).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

function isHighPressureSignal(signal: ModelingHint['signals'][number]): boolean {
  return (
    signal === 'concurrency_pressure' ||
    signal === 'document_size_pressure' ||
    signal === 'lifecycle_pressure' ||
    signal === 'relationship_pressure'
  );
}

function dedupeReviewItems(items: DomainReviewItem[]): DomainReviewItem[] {
  const seen = new Set<string>();
  const out: DomainReviewItem[] = [];
  for (const item of items) {
    const key = `${item.path}:${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function scopeFromPath(schema: Schema, path: string): string {
  const match = path.match(/^types\.(\d+)(?:\.fields\.(\d+))?/u);
  if (!match) return 'model';
  const type = schema.types[Number(match[1])];
  if (!type) return 'model';
  if (type.kind === 'object' && match[2] !== undefined) {
    const field = type.fields[Number(match[2])];
    if (field) return `${type.name}.${field.name}`;
  }
  return type.name;
}

function countInvariants(schema: Schema): number {
  return schema.types.reduce((sum, type) => {
    if (type.kind !== 'object') return sum;
    return sum + (type.invariants?.length ?? 0);
  }, 0);
}

function countDerivations(schema: Schema): number {
  return schema.types.reduce((sum, type) => {
    if (type.kind !== 'object') return sum;
    return sum + type.fields.filter((field) => Boolean(field.derivation)).length;
  }, 0);
}
