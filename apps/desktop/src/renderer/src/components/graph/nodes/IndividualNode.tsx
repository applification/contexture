import type { IndividualNode as IndividualNodeType } from '@renderer/model/reactflow';
import { useUIStore } from '@renderer/store/ui';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';

export const IndividualNode = memo(function IndividualNode({
  data,
  id,
}: NodeProps<IndividualNodeType>) {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const adjacentNodeIds = useUIStore((s) => s.adjacentNodeIds);
  const isSelected = selectedNodeId === id;
  const isAdjacent = !isSelected && adjacentNodeIds.includes(id);
  const isDimmed = selectedNodeId !== null && !isSelected && !isAdjacent;
  const hasErrors = data.errorCount > 0;

  return (
    <div
      className="ontograph-individual-node"
      style={{
        minWidth: 160,
        maxWidth: 220,
        borderRadius: 12,
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        border: isSelected
          ? '2px solid var(--graph-node-selected)'
          : isAdjacent
            ? '2px solid var(--graph-node-adjacent)'
            : hasErrors
              ? '1px solid var(--destructive)'
              : '1px dashed var(--graph-node-individual-border, oklch(0.65 0.15 160))',
        boxShadow: '0 2px 8px oklch(0 0 0 / 0.15), 0 0 1px oklch(0 0 0 / 0.1)',
        background: isSelected ? 'var(--graph-node-selected-bg)' : 'transparent',
        opacity: isDimmed ? 0.2 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, top: '50%', left: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Left}
        style={{ opacity: 0, top: '50%', left: '50%' }}
      />

      <div
        style={{
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--graph-node-header-text)',
          background: 'var(--graph-node-individual-header-bg, oklch(0.25 0.06 160))',
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            opacity: 0.6,
            flexShrink: 0,
          }}
        >
          ◆
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.label}</span>
        {(data.errorCount > 0 || data.warningCount > 0) && (
          <span style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 'auto' }}>
            {data.errorCount > 0 && (
              <span
                title={`${data.errorCount} error${data.errorCount > 1 ? 's' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  fontSize: 9,
                  fontWeight: 700,
                  background: 'var(--destructive)',
                  color: 'var(--destructive-foreground)',
                  padding: '0 4px',
                  lineHeight: 1,
                }}
              >
                {data.errorCount}
              </span>
            )}
            {data.warningCount > 0 && (
              <span
                title={`${data.warningCount} warning${data.warningCount > 1 ? 's' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  fontSize: 9,
                  fontWeight: 700,
                  background: 'oklch(0.75 0.18 85)',
                  color: 'oklch(0.25 0.05 85)',
                  padding: '0 4px',
                  lineHeight: 1,
                }}
              >
                {data.warningCount}
              </span>
            )}
          </span>
        )}
      </div>

      {data.typeLabels.length > 0 && (
        <div
          style={{
            padding: '4px 10px',
            background: 'var(--graph-node-body-bg)',
          }}
        >
          {data.typeLabels.map((typeLabel, i) => (
            <div
              key={data.types[i]}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '2px 0',
                fontSize: 10,
                gap: 4,
              }}
            >
              <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                a {typeLabel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
