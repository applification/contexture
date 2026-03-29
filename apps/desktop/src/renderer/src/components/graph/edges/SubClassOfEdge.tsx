import { useUIStore } from '@renderer/store/ui';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  useInternalNode,
} from '@xyflow/react';
import { memo } from 'react';
import { getFloatingEdgeParams } from './floating-edge-utils';

function autoRotation(sx: number, sy: number, tx: number, ty: number): number {
  let angle = Math.atan2(ty - sy, tx - sx) * (180 / Math.PI);
  if (angle > 90 || angle < -90) angle += 180;
  return angle;
}

export const SubClassOfEdge = memo(function SubClassOfEdge({
  id,
  source,
  target,
  selected,
}: EdgeProps) {
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

  const isAdjacent = adjacentEdgeIds.includes(id);
  const isDimmed = selectedNodeId !== null && !isAdjacent;
  const color = 'var(--graph-edge-subclass)';
  const markerId = `subclass-arrow-${id}`;
  const rotation = autoRotation(sx, sy, tx, ty);

  return (
    <>
      <g style={{ opacity: isDimmed ? 0.15 : 1, transition: 'opacity 0.15s ease' }}>
        <defs>
          <marker id={markerId} markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="none" stroke={color} strokeWidth={1.2} />
          </marker>
        </defs>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: selected ? 3 : isAdjacent ? 3 : 2,
            strokeDasharray: '8,4',
            markerEnd: `url(#${markerId})`,
          }}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) rotate(${rotation}deg)`,
            fontSize: 10,
            fontWeight: 500,
            color: '#fff',
            background: color,
            padding: '2px 5px',
            borderRadius: 4,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            opacity: isDimmed ? 0.15 : 1,
            transition: 'opacity 0.15s ease',
          }}
          className="nodrag nopan"
        >
          subClassOf
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
