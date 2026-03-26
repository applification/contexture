import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
// Floating edges use useInternalNode to compute real intersection points,
// so handles are invisible and centered — they exist only for RF's connection model.
import { useUIStore } from '@renderer/store/ui'
import type { ClassNode as ClassNodeType } from '@renderer/model/reactflow'

export const ClassNode = memo(function ClassNode({ data, id }: NodeProps<ClassNodeType>) {
  const showDatatypeProperties = useUIStore((s) => s.graphFilters.showDatatypeProperties)
  const selectedNodeId = useUIStore((s) => s.selectedNodeId)
  const adjacentNodeIds = useUIStore((s) => s.adjacentNodeIds)
  const isSelected = selectedNodeId === id
  const isAdjacent = !isSelected && adjacentNodeIds.includes(id)
  const isDimmed = selectedNodeId !== null && !isSelected && !isAdjacent

  return (
    <div
      className="ontograph-class-node"
      style={{
        minWidth: 160,
        maxWidth: 220,
        borderRadius: 8,
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        border: isSelected
          ? '2px solid var(--graph-node-selected)'
          : isAdjacent
            ? '2px solid var(--graph-node-adjacent)'
            : '1px solid var(--graph-node-border)',
        boxShadow: '0 2px 8px oklch(0 0 0 / 0.15), 0 0 1px oklch(0 0 0 / 0.1)',
        background: isSelected ? 'var(--graph-node-selected-bg)' : 'transparent',
        opacity: isDimmed ? 0.2 : 1,
        transition: 'opacity 0.15s ease'
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, top: '50%', left: '50%' }} />
      <Handle type="source" position={Position.Left} style={{ opacity: 0, top: '50%', left: '50%' }} />

      <div
        style={{
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--graph-node-header-text)',
          background: 'var(--graph-node-header-bg)',
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {data.label}
      </div>

      {showDatatypeProperties && data.datatypeProperties.length > 0 && (
        <div
          style={{
            padding: '4px 0',
            background: 'var(--graph-node-body-bg)'
          }}
        >
          {data.datatypeProperties.map((prop) => (
            <div
              key={prop.uri}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '2px 10px',
                fontSize: 10,
                gap: 8
              }}
            >
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>{prop.label}</span>
              <span
                style={{
                  color: 'var(--graph-edge-property)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9
                }}
              >
                {prop.range}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
