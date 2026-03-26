import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react'
import type { ObjPropEdgeData } from '@renderer/model/reactflow'
import { getFloatingEdgeParams } from './floating-edge-utils'
import { useUIStore } from '@renderer/store/ui'

type ObjPropEdge = Edge<ObjPropEdgeData>

function autoRotation(sx: number, sy: number, tx: number, ty: number): number {
  let angle = Math.atan2(ty - sy, tx - sx) * (180 / Math.PI)
  if (angle > 90 || angle < -90) angle += 180
  return angle
}

export const ObjectPropertyEdge = memo(function ObjectPropertyEdge({
  id,
  source,
  target,
  data,
  selected
}: EdgeProps<ObjPropEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const selectedNodeId = useUIStore((s) => s.selectedNodeId)
  const adjacentEdgeIds = useUIStore((s) => s.adjacentEdgeIds)

  if (!sourceNode || !targetNode) return null

  const { sx, sy, tx, ty, sourcePosition, targetPosition } = getFloatingEdgeParams(sourceNode, targetNode)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition,
    targetX: tx,
    targetY: ty,
    targetPosition
  })

  const isAdjacent = adjacentEdgeIds.includes(id)
  const isDimmed = selectedNodeId !== null && !isAdjacent
  const color = 'var(--graph-edge-property)'
  const markerId = `objprop-arrow-${id}`
  const rotation = autoRotation(sx, sy, tx, ty)

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
            markerEnd: `url(#${markerId})`
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
              transition: 'opacity 0.15s ease'
            }}
            className="nodrag nopan"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
