/**
 * RefEdge — field-ref → target-type edge, drawn as a floating bezier
 * between the two nodes' rectangle intersections so the line never
 * clips the node body.
 *
 * Styling:
 *   - Local ref (`crossBoundary: false`): solid edge in the property
 *     accent, thicker when selected or adjacent to the selected node.
 *   - Cross-boundary (stdlib / imported) ref: dashed, muted stroke so
 *     the boundary between the user's schema and an imported namespace
 *     reads at a glance.
 *   - A tiny label near the midpoint shows the source field name
 *     (`plot.crop`, etc.) so the user can tell which field carries the
 *     ref without selecting the edge.
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
import { useUIStore } from '../../../store/ui';
import type { RefEdgeData } from '../schema-to-graph';
import { getFloatingEdgeParams } from './floating-edge-utils';

type RefEdgeKind = Edge<RefEdgeData, 'ref'>;

export const RefEdge = memo(function RefEdge(props: EdgeProps<RefEdgeKind>) {
  const { id, source, target, data, selected } = props;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const adjacentEdgeIds = useUIStore((s) => s.adjacentEdgeIds);

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
  const isAdjacent = adjacentEdgeIds.includes(id);
  // Dim edges that touch neither the selected node nor an adjacent one.
  const isDimmed =
    selectedNodeId !== null &&
    !isAdjacent &&
    source !== selectedNodeId &&
    target !== selectedNodeId;

  const stroke =
    selected || isAdjacent
      ? 'var(--graph-node-selected)'
      : crossBoundary
        ? 'var(--graph-edge-import, var(--muted-foreground))'
        : 'var(--graph-edge-property)';
  const strokeWidth = selected || isAdjacent ? 2 : 1.25;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray: crossBoundary ? '6 4' : undefined,
          opacity: isDimmed ? 0.2 : 1,
          transition: 'opacity 0.15s ease, stroke 0.1s ease',
          fill: 'none',
        }}
      />
      {data && (
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
          >
            {data.sourceField}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
