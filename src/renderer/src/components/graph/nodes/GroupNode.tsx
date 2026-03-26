import { memo } from 'react'
import { Handle, Position, type NodeProps, NodeResizer } from '@xyflow/react'
import type { GroupNode as GroupNodeType } from '@renderer/model/reactflow'

export const GroupNode = memo(function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 12,
        border: selected
          ? '2px dashed var(--graph-node-selected)'
          : '1.5px dashed oklch(0.5 0.1 250 / 0.5)',
        background: 'oklch(0.35 0.05 250 / 0.08)',
        backdropFilter: 'blur(4px)',
        position: 'relative'
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected}
        lineStyle={{ borderColor: 'var(--graph-node-class)' }}
        handleStyle={{ backgroundColor: 'var(--graph-node-class)', borderRadius: 2 }}
      />

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--graph-node-class)',
          letterSpacing: '0.02em',
          userSelect: 'none',
          pointerEvents: 'none'
        }}
      >
        {data.label}
      </div>
    </div>
  )
})
