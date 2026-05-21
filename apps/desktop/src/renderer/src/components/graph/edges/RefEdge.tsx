/**
 * RefEdge — field-ref → target-type edge, drawn as a floating bezier
 * between the two nodes' rectangle intersections so the line never
 * clips the node body.
 *
 * Styling:
 *   - Field refs use the property accent and label the source field.
 *   - Inferred table id relationships are dashed because they are a
 *     diagram-only convention, not an IR ref.
 *   - Union variants use the discriminated-union accent and a dotted
 *     stroke so inheritance-like membership does not read as a field.
 *   - Cross-boundary refs are dashed and muted so imported namespaces read
 *     at a glance.
 */
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  useInternalNode,
} from '@xyflow/react';
import { memo } from 'react';
import { useGraphSelectionStore } from '../../../store/selection';
import type { RefEdgeData } from '../schema-to-graph';
import { getFloatingEdgeParams } from './floating-edge-utils';

type RefEdgeKind = Edge<RefEdgeData, 'ref'>;

export const RefEdge = memo(function RefEdge(props: EdgeProps<RefEdgeKind>) {
  const { id, source, target, data, selected } = props;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const selectedNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
  const adjacentEdgeIds = useGraphSelectionStore((s) => s.state.adjacency.edgeIds);

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePosition, targetPosition } = getFloatingEdgeParams(
    sourceNode,
    targetNode,
  );

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition,
    targetX: tx,
    targetY: ty,
    targetPosition,
  });

  const crossBoundary = data?.crossBoundary === true;
  const isUnionVariant = data?.relation === 'unionVariant';
  const isTableId = data?.relation === 'tableId';
  const isAdjacent = adjacentEdgeIds.has(id);
  // Dim edges that touch neither the selected node nor an adjacent one.
  const isDimmed =
    selectedNodeId !== null &&
    !isAdjacent &&
    source !== selectedNodeId &&
    target !== selectedNodeId;

  const stroke =
    selected || isAdjacent
      ? 'var(--graph-node-selected)'
      : isUnionVariant
        ? 'var(--graph-edge-union, var(--chart-4))'
        : crossBoundary
          ? 'var(--graph-edge-import, var(--muted-foreground))'
          : 'var(--graph-edge-ref, var(--graph-edge-property))';
  const strokeWidth = selected || isAdjacent ? 2 : 1.25;
  const strokeDasharray = isUnionVariant ? '2 4' : isTableId || crossBoundary ? '6 4' : undefined;
  const label = isUnionVariant ? 'variant' : data?.sourceField;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray,
          opacity: isDimmed ? 0.2 : 1,
          transition: 'opacity 0.15s ease, stroke 0.1s ease',
          fill: 'none',
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--muted-foreground)',
              padding: '1px 5px',
              borderRadius: 3,
              fontSize: 9,
              fontFamily: 'var(--font-mono, monospace)',
              pointerEvents: 'none',
              opacity: isDimmed ? 0.2 : 0.85,
              whiteSpace: 'nowrap',
            }}
            data-testid="ref-edge"
            data-cross-boundary={crossBoundary ? 'true' : 'false'}
            data-relation={data?.relation ?? 'fieldRef'}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
