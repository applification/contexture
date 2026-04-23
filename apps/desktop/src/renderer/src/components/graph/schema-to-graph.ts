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
 *   - Only `object` TypeDefs contribute edges — their `ref` fields and
 *     `ref`-typed array elements point at target types.
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

import type { Edge, Node } from '@xyflow/react';
import type { FieldDef, FieldType, Schema, TypeDef } from '../../model/ir';

export interface TypeNodeData extends Record<string, unknown> {
  /** Fully-qualified type name (local or `<alias>.<Name>`). */
  typeName: string;
  kind: TypeDef['kind'];
  description?: string;
  fields: ReadonlyArray<FieldRow>;
  imported: boolean;
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
}

export interface RefEdgeData extends Record<string, unknown> {
  sourceType: string;
  sourceField: string;
  targetType: string;
  /** True when the target is an imported (out-of-file) type. */
  crossBoundary: boolean;
}

export interface BuildGraphInput {
  schema: Schema;
  positions?: Record<string, { x: number; y: number }>;
}

export interface BuildGraphResult {
  nodes: Node<TypeNodeData>[];
  edges: Edge<RefEdgeData>[];
}

const DEFAULT_POSITION = { x: 0, y: 0 };

export function buildGraph({ schema, positions }: BuildGraphInput): BuildGraphResult {
  const localNames = new Set(schema.types.map((t) => t.name));

  const nodes: Node<TypeNodeData>[] = schema.types.map((t) =>
    localNodeFor(t, positions?.[t.name] ?? DEFAULT_POSITION),
  );

  // Collect edges + shadow nodes for qualified refs that point outside
  // the local schema.
  const edges: Edge<RefEdgeData>[] = [];
  const externalNodeIds = new Set<string>();

  for (const type of schema.types) {
    if (type.kind !== 'object') continue;
    for (const field of type.fields) {
      const target = unwrapRefTarget(field.type);
      if (!target) continue;

      const crossBoundary = target.includes('.') || !localNames.has(target);
      if (crossBoundary && !externalNodeIds.has(target)) {
        externalNodeIds.add(target);
        nodes.push(externalNodeFor(target, positions?.[target] ?? DEFAULT_POSITION));
      }

      edges.push({
        id: `${type.name}.${field.name}->${target}`,
        source: type.name,
        target,
        type: 'ref',
        data: {
          sourceType: type.name,
          sourceField: field.name,
          targetType: target,
          crossBoundary,
        },
      });
    }
  }

  return { nodes, edges };
}

function localNodeFor(type: TypeDef, position: { x: number; y: number }): Node<TypeNodeData> {
  return {
    id: type.name,
    type: 'type',
    position,
    data: {
      typeName: type.name,
      kind: type.kind,
      description: type.description,
      fields: type.kind === 'object' ? type.fields.map(fieldRow) : [],
      imported: false,
    },
  };
}

function externalNodeFor(typeName: string, position: { x: number; y: number }): Node<TypeNodeData> {
  return {
    id: typeName,
    type: 'type',
    position,
    data: {
      typeName,
      kind: 'object',
      fields: [],
      imported: true,
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

function fieldRow(field: FieldDef): FieldRow {
  const target = unwrapRefTarget(field.type);
  return {
    name: field.name,
    summary: summariseFieldType(field.type),
    optional: field.optional === true,
    nullable: field.nullable === true,
    refTarget: target,
  };
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
