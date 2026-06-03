/**
 * Pure IR → XYFlow graph adapter.
 *
 * Given a schema and (optionally) a layout sidecar's positions, produce
 * the node+edge arrays XYFlow needs to render the canvas. Splitting this
 * out from the React layer keeps unit-testing trivial: every rendering
 * decision (which fields become sub-rows, which refs become edges, which
 * nodes are marked as imported) lives in one tested function.
 *
 * Edge policy:
 *   - `object` TypeDefs contribute field-ref edges — their `ref` fields
 *     and `ref`-typed array elements point at target types.
 *   - Convex table id fields may contribute diagram-only inferred edges:
 *     non-ref fields ending in `Id` whose description mentions another
 *     local table render as dashed relationships without changing IR
 *     semantics.
 *   - `discriminatedUnion` TypeDefs contribute variant edges to each
 *     object type listed in `variants`.
 *   - Qualified refs (`alias.Name`) always point at the imported
 *     namespace; the target node id is the same alias-qualified name so
 *     the renderer can choose to hide/show or badge external targets.
 *   - A field with nested `array<array<ref>>` is unwrapped until the
 *     concrete element kind is known; only `ref` elements emit edges.
 *
 * Imported nodes (discriminated via `data.imported`) carry the qualified
 * name in `data.typeName` so downstream code can still key by it;
 * rendering uses `data.imported` to pick the dashed-border style.
 */

import type { FieldDef, FieldType, Schema, TypeDef } from '@contexture/core/ir';
import type { ModelingHint } from '@contexture/core/modeling-hints';
import { STDLIB_REGISTRY, STDLIB_TYPE_DEFINITIONS } from '@shared/stdlib-registry';
import type { Edge, Node } from '@xyflow/react';

type TableTypeDef = Extract<TypeDef, { kind: 'object' }> & { table: true };

export interface TypeNodeData extends Record<string, unknown> {
  /** Fully-qualified type name (local or `<alias>.<Name>`). */
  typeName: string;
  /** Source `schema.types` index for local nodes; absent for shadow/imported nodes. */
  schemaIndex?: number;
  kind: TypeDef['kind'];
  description?: string;
  enumValues?: ReadonlyArray<EnumValueRow>;
  fields: ReadonlyArray<FieldRow>;
  imported: boolean;
  syncHighlighted?: boolean;
  focusedFieldName?: string;
  previewRole?: 'primary' | 'adjacent';
  previewDimmed?: boolean;
  validationIssueCount?: number;
  /** True when the source `ObjectTypeDef` carries `table: true`. */
  table?: boolean;
  /** True when this imported node represents a bundled stdlib type. */
  stdlib?: boolean;
  /** Local object nodes can create fields directly from the canvas. */
  canAddFields?: boolean;
}

export interface EnumValueRow {
  value: string;
  description?: string;
}

export interface FieldRow {
  name: string;
  summary: string;
  optional: boolean;
  nullable: boolean;
  /**
   * Target type for an outgoing ref (if the field, or its unwrapped array
   * element, is a `ref`). Used to draw `RefEdge`s.
   */
  refTarget?: string;
  refTargetKind?: TypeDef['kind'];
  /** Local enum metadata when this field references an enum TypeDef. */
  enumTarget?: EnumTargetRow;
  /** Bundled stdlib metadata when this field references `namespace.Type`. */
  stdlibTarget?: StdlibTargetRow;
  validationIssueCount?: number;
  modelingHintCount?: number;
  modelingHintTone?: 'advisory' | 'warning';
}

export interface EnumTargetRow {
  name: string;
  description?: string;
  values: ReadonlyArray<EnumValueRow>;
}

export interface StdlibTargetRow {
  name: string;
  description?: string;
  kind: TypeDef['kind'];
  values?: ReadonlyArray<EnumValueRow>;
}

export interface RefEdgeData extends Record<string, unknown> {
  relation: 'fieldRef' | 'tableId' | 'unionVariant';
  sourceType: string;
  sourceField?: string;
  targetType: string;
  discriminator?: string;
  /** True when the target is an imported (out-of-file) type. */
  crossBoundary: boolean;
  /** True when the target is a bundled stdlib type. */
  stdlib?: boolean;
  previewHighlighted?: boolean;
  previewDimmed?: boolean;
}

export interface BuildGraphInput {
  schema: Schema;
  positions?: Record<string, { x: number; y: number }>;
  modelingHints?: readonly ModelingHint[];
}

export interface BuildGraphResult {
  nodes: Node<TypeNodeData>[];
  edges: Edge<RefEdgeData>[];
}

const DEFAULT_POSITION = { x: 0, y: 0 };

export function buildGraph({
  schema,
  positions,
  modelingHints = [],
}: BuildGraphInput): BuildGraphResult {
  const localNames = new Set(schema.types.map((t) => t.name));
  const localTypes = new Map(schema.types.map((type) => [type.name, type]));
  const tableTypes = schema.types.filter(isTableType);
  const fieldHintMap = fieldModelingHintMap(modelingHints);

  const nodes: Node<TypeNodeData>[] = schema.types.map((t, schemaIndex) =>
    localNodeFor(t, schemaIndex, positions?.[t.name] ?? DEFAULT_POSITION, localTypes, fieldHintMap),
  );

  // Collect edges + shadow nodes for targets that point outside the local
  // schema. Discriminated-union variants should normally be local, but the
  // fallback keeps invalid/in-progress schemas renderable while validation
  // reports the semantic issue elsewhere.
  const edges: Edge<RefEdgeData>[] = [];
  const externalNodeIds = new Set<string>();

  const ensureExternalNode = (target: string): { crossBoundary: boolean; stdlib: boolean } => {
    const crossBoundary = target.includes('.') || !localNames.has(target);
    const stdlib = isStdlibRef(target);
    if (crossBoundary && !externalNodeIds.has(target)) {
      externalNodeIds.add(target);
      nodes.push(externalNodeFor(target, positions?.[target] ?? DEFAULT_POSITION, stdlib));
    }
    return { crossBoundary, stdlib };
  };

  for (const type of schema.types) {
    if (type.kind === 'discriminatedUnion') {
      for (const variant of type.variants) {
        const { crossBoundary, stdlib } = ensureExternalNode(variant);
        edges.push({
          id: `${type.name}.variant->${variant}`,
          source: type.name,
          target: variant,
          type: 'ref',
          data: {
            relation: 'unionVariant',
            sourceType: type.name,
            targetType: variant,
            discriminator: type.discriminator,
            crossBoundary,
            stdlib,
          },
        });
      }
      continue;
    }

    if (type.kind !== 'object') continue;
    for (const field of type.fields) {
      const target = unwrapRefTarget(field.type);
      if (target) {
        const { crossBoundary, stdlib } = ensureExternalNode(target);

        edges.push({
          id: `${type.name}.${field.name}->${target}`,
          source: type.name,
          target,
          type: 'ref',
          data: {
            relation: 'fieldRef',
            sourceType: type.name,
            sourceField: field.name,
            targetType: target,
            crossBoundary,
            stdlib,
          },
        });
        continue;
      }

      const inferredTarget = inferTableIdTarget(type, field, tableTypes);
      if (!inferredTarget) continue;

      edges.push({
        id: `${type.name}.${field.name}~>${inferredTarget.name}`,
        source: type.name,
        target: inferredTarget.name,
        type: 'ref',
        data: {
          relation: 'tableId',
          sourceType: type.name,
          sourceField: field.name,
          targetType: inferredTarget.name,
          crossBoundary: false,
        },
      });
    }
  }

  return { nodes, edges };
}

function localNodeFor(
  type: TypeDef,
  schemaIndex: number,
  position: { x: number; y: number },
  localTypes: ReadonlyMap<string, TypeDef>,
  fieldHintMap: ReadonlyMap<string, FieldModelingHintSummary>,
): Node<TypeNodeData> {
  return {
    id: type.name,
    type: 'type',
    position,
    data: {
      typeName: type.name,
      schemaIndex,
      kind: type.kind,
      description: type.description,
      enumValues: type.kind === 'enum' ? type.values.map(enumValueRow) : undefined,
      fields:
        type.kind === 'object'
          ? type.fields.map((field) =>
              fieldRow(field, localTypes, fieldHintMap.get(fieldHintKey(type.name, field.name))),
            )
          : [],
      imported: false,
      table: type.kind === 'object' && type.table === true ? true : undefined,
      canAddFields: type.kind === 'object' ? true : undefined,
    },
  };
}

function externalNodeFor(
  typeName: string,
  position: { x: number; y: number },
  stdlib: boolean,
): Node<TypeNodeData> {
  return {
    id: typeName,
    type: 'type',
    position,
    data: {
      typeName,
      kind: 'object',
      fields: [],
      imported: true,
      stdlib,
    },
  };
}

/**
 * Strip optional `array<...>` wrappers to reach the concrete `FieldType`.
 * Returns the target type name iff that concrete type is `ref`.
 */
function unwrapRefTarget(t: FieldType): string | undefined {
  let cur: FieldType = t;
  while (cur.kind === 'array') cur = cur.element;
  return cur.kind === 'ref' ? cur.typeName : undefined;
}

function inferTableIdTarget(
  sourceType: TypeDef,
  field: FieldDef,
  tableTypes: ReadonlyArray<TableTypeDef>,
): TableTypeDef | undefined {
  if (sourceType.kind !== 'object' || sourceType.table !== true) return undefined;
  if (!field.name.endsWith('Id') || !field.description) return undefined;
  if (unwrapRefTarget(field.type)) return undefined;

  const description = field.description.toLowerCase();
  return tableTypes.find((candidate) => {
    if (candidate.name === sourceType.name) return false;
    return [candidate.name, candidate.tableName]
      .filter((name): name is string => name !== undefined)
      .some((name) => mentionsName(description, name));
  });
}

function isTableType(type: TypeDef): type is TableTypeDef {
  return type.kind === 'object' && type.table === true;
}

function mentionsName(description: string, name: string): boolean {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase();
  return new RegExp(`(^|[^a-z0-9])${escapedName}([^a-z0-9]|$)`).test(description);
}

function enumValueRow(value: { value: string; description?: string }): EnumValueRow {
  return {
    value: value.value,
    description: value.description,
  };
}

interface FieldModelingHintSummary {
  count: number;
  tone: 'advisory' | 'warning';
}

function fieldRow(
  field: FieldDef,
  localTypes: ReadonlyMap<string, TypeDef>,
  modelingHint?: FieldModelingHintSummary,
): FieldRow {
  const target = unwrapRefTarget(field.type);
  const refTargetType = target ? localTypes.get(target) : undefined;
  const enumTarget = refTargetType?.kind === 'enum' ? refTargetType : undefined;
  const stdlibTarget = target && !refTargetType ? stdlibTargetRow(target) : undefined;
  return {
    name: field.name,
    summary: summariseFieldType(field.type),
    optional: field.optional === true,
    nullable: field.nullable === true,
    refTarget: target,
    refTargetKind: refTargetType?.kind,
    enumTarget: enumTarget
      ? {
          name: enumTarget.name,
          description: enumTarget.description,
          values: enumTarget.values.map(enumValueRow),
        }
      : undefined,
    stdlibTarget,
    modelingHintCount: modelingHint?.count,
    modelingHintTone: modelingHint?.tone,
  };
}

function fieldModelingHintMap(
  modelingHints: readonly ModelingHint[],
): Map<string, FieldModelingHintSummary> {
  const hintsByField = new Map<string, ModelingHint[]>();
  for (const hint of modelingHints) {
    if (!hint.fieldName) continue;
    const key = fieldHintKey(hint.typeName, hint.fieldName);
    const existing = hintsByField.get(key) ?? [];
    existing.push(hint);
    hintsByField.set(key, existing);
  }

  const summaries = new Map<string, FieldModelingHintSummary>();
  for (const [key, hints] of hintsByField) {
    summaries.set(key, {
      count: hints.length,
      tone: hints.some(hasHighPressureModelingSignal) ? 'warning' : 'advisory',
    });
  }
  return summaries;
}

function fieldHintKey(typeName: string, fieldName: string): string {
  return `${typeName}:${fieldName}`;
}

function hasHighPressureModelingSignal(hint: ModelingHint): boolean {
  return hint.signals.some(
    (signal) => signal === 'concurrency_pressure' || signal === 'document_size_pressure',
  );
}

function stdlibTargetRow(typeName: string): StdlibTargetRow | undefined {
  if (!isStdlibRef(typeName)) return undefined;
  const type = STDLIB_TYPE_DEFINITIONS.get(typeName);
  if (!type) return undefined;
  return {
    name: typeName,
    description: type.description,
    kind: type.kind,
    values: type.kind === 'enum' ? type.values.map(enumValueRow) : undefined,
  };
}

function isStdlibRef(typeName: string): boolean {
  const [namespace, name, ...rest] = typeName.split('.');
  return (
    rest.length === 0 &&
    namespace !== undefined &&
    name !== undefined &&
    STDLIB_REGISTRY.hasType(namespace, name)
  );
}

export function summariseFieldType(t: FieldType): string {
  switch (t.kind) {
    case 'string': {
      const parts: string[] = ['string'];
      if (t.format) parts.push(t.format);
      if (t.min !== undefined || t.max !== undefined) parts.push(`${t.min ?? ''}–${t.max ?? ''}`);
      return parts.length === 1 ? 'string' : `string(${parts.slice(1).join(', ')})`;
    }
    case 'number': {
      const label = t.int ? 'int' : 'number';
      if (t.min === undefined && t.max === undefined) return label;
      return `${label}(${t.min ?? ''}–${t.max ?? ''})`;
    }
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'literal':
      return `literal(${JSON.stringify(t.value)})`;
    case 'ref':
      return `→ ${t.typeName}`;
    case 'array':
      return `${summariseFieldType(t.element)}[]`;
  }
}
