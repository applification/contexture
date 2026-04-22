/**
 * RefEdge — field-ref → target-type edge.
 *
 * Uses a straight bezier between node centres because #92 doesn't yet
 * introduce per-field handles; field-level handles land in #93 when
 * drag-to-ref interactions need the anchor. Until then a centre-to-
 * centre line communicates the relationship cleanly.
 *
 * Styling:
 *   - Local ref (`crossBoundary: false`): solid, default stroke.
 *   - External/stdlib ref (`crossBoundary: true`): dashed, muted stroke
 *     so the user can see the boundary between their schema and an
 *     imported namespace at a glance.
 */
import { BaseEdge, type EdgeProps, getStraightPath } from '@xyflow/react';
import { memo } from 'react';
import type { RefEdgeData } from '../schema-to-graph';

type EdgeType = {
  type: 'ref';
  data: RefEdgeData;
};

export const RefEdge = memo(function RefEdge(props: EdgeProps<EdgeType>) {
  const { sourceX, sourceY, targetX, targetY, data, selected } = props;
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const crossBoundary = data?.crossBoundary === true;
  const stroke = selected
    ? 'var(--graph-edge-selected, oklch(0.75 0.15 240))'
    : crossBoundary
      ? 'var(--graph-edge-import, oklch(0.55 0.04 240))'
      : 'var(--graph-edge-ref, currentColor)';

  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{
        stroke,
        strokeWidth: selected ? 2 : 1,
        strokeDasharray: crossBoundary ? '6 4' : undefined,
        fill: 'none',
      }}
      data-testid="ref-edge"
      data-cross-boundary={crossBoundary ? 'true' : 'false'}
    />
  );
});
