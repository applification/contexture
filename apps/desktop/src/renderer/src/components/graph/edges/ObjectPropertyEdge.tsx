import type { ObjPropEdgeData } from '@renderer/model/reactflow';
import type { OWLCharacteristic } from '@renderer/model/types';
import { useUIStore } from '@renderer/store/ui';
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  useInternalNode,
} from '@xyflow/react';
import { memo } from 'react';
import { getFloatingEdgeParams } from './floating-edge-utils';

type ObjPropEdge = Edge<ObjPropEdgeData>;

const CHAR_ABBREV: Record<OWLCharacteristic, { abbr: string; title: string }> = {
  transitive: { abbr: 'T', title: 'Transitive' },
  symmetric: { abbr: 'S', title: 'Symmetric' },
  reflexive: { abbr: 'R', title: 'Reflexive' },
  functional: { abbr: 'F', title: 'Functional' },
  inverseFunctional: { abbr: 'IF', title: 'Inverse Functional' },
};

function autoRotation(sx: number, sy: number, tx: number, ty: number): number {
  let angle = Math.atan2(ty - sy, tx - sx) * (180 / Math.PI);
  if (angle > 90 || angle < -90) angle += 180;
  return angle;
}

export const ObjectPropertyEdge = memo(function ObjectPropertyEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps<ObjPropEdge>) {
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
  const color = 'var(--graph-edge-property)';
  const markerId = `objprop-arrow-${id}`;
  const rotation = autoRotation(sx, sy, tx, ty);
  const uniqueCharacteristics = [...new Set(data?.characteristics ?? [])];

  return (
    <>
      <g style={{ opacity: isDimmed ? 0.15 : 1, transition: 'opacity 0.15s ease' }}>
        <defs>
          <marker id={markerId} markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={color} />
          </marker>
        </defs>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: selected ? 3 : isAdjacent ? 2.5 : 1.5,
            markerEnd: `url(#${markerId})`,
          }}
        />
      </g>
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) rotate(${rotation}deg)`,
              fontSize: 11,
              fontWeight: 500,
              color: '#fff',
              background: color,
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              opacity: isDimmed ? 0.15 : 1,
              transition: 'opacity 0.15s ease',
            }}
            className="nodrag nopan"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
      {uniqueCharacteristics.length > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + 18}px) rotate(${rotation}deg)`,
              display: 'flex',
              gap: 2,
              opacity: isDimmed ? 0.15 : 1,
              transition: 'opacity 0.15s ease',
              pointerEvents: 'none',
            }}
            className="nodrag nopan"
          >
            {uniqueCharacteristics.map((c) => {
              const { abbr, title } = CHAR_ABBREV[c];
              return (
                <span
                  key={c}
                  title={title}
                  style={{
                    fontSize: 5,
                    fontFamily: 'monospace',
                    height: 10,
                    background: 'var(--characteristic-badge-bg)',
                    border: '1px solid var(--characteristic-badge-border)',
                    color: 'var(--characteristic-badge-text)',
                    padding: '0 2px',
                    borderRadius: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {abbr}
                </span>
              );
            })}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
