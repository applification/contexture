/**
 * TypeNode — renders one Contexture `TypeDef` on the canvas.
 *
 * Visual language mirrors the pre-pivot `ClassNode`:
 *   - Glassmorphic body with backdrop-blur so edges behind show through.
 *   - Coloured header strip (primary accent for object / DU, chart
 *     colours for enum / raw) so different TypeDef kinds read at a
 *     glance without a badge.
 *   - Field rows under the header as a flat list, right-aligned type
 *     summary (ref fields use the edge-property colour for the summary).
 *   - Selection, adjacency dimming, and imported-boundary styling all
 *     driven from the UI store.
 *
 * The footprint uses XYFlow `<Handle>`s as invisible connection points;
 * the actual edge anchoring uses floating intersection math in
 * `floating-edge-utils.ts`. Field-level drag-to-ref handles come in a
 * later slice.
 */
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { memo, useCallback, useMemo } from 'react';
import { useGraphSelectionStore } from '../../../store/selection';
import type { TypeNodeData } from '../schema-to-graph';

export interface FieldSelection {
  typeName: string;
  fieldName: string;
}

export const TYPE_NODE_EVENT = 'contexture:field-select' as const;

type TypeNodeKind = Node<TypeNodeData, 'type'>;

/**
 * Header colour per TypeDef kind. Uses OKLCH tokens already defined in
 * `globals.css`; falling back to `--primary` so any future kind still
 * renders a legible header.
 */
function headerColorFor(kind: TypeNodeData['kind']): string {
  switch (kind) {
    case 'object':
      return 'var(--graph-node-header-bg)';
    case 'enum':
      return 'color-mix(in oklch, var(--chart-3) 85%, transparent)';
    case 'discriminatedUnion':
      return 'color-mix(in oklch, var(--chart-4) 85%, transparent)';
    case 'raw':
      return 'color-mix(in oklch, var(--muted-foreground) 55%, transparent)';
    default:
      return 'var(--graph-node-header-bg)';
  }
}

export const TypeNode = memo(function TypeNode(props: NodeProps<TypeNodeKind>) {
  const { data, id } = props;
  const click = useGraphSelectionStore((s) => s.click);
  const primaryNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
  const adjacentNodeIds = useGraphSelectionStore((s) => s.state.adjacency.nodeIds);

  const isSelected = primaryNodeId === id;
  const isAdjacent = !isSelected && adjacentNodeIds.has(id);
  const isDimmed = primaryNodeId !== null && !isSelected && !isAdjacent;

  const onFieldClick = useCallback(
    (fieldName: string, ev: React.MouseEvent<HTMLElement>) => {
      ev.stopPropagation();
      click(data.typeName, 'replace');
      const detail: FieldSelection = { typeName: data.typeName, fieldName };
      ev.currentTarget.dispatchEvent(new CustomEvent(TYPE_NODE_EVENT, { bubbles: true, detail }));
    },
    [data.typeName, click],
  );

  const borderColor = isSelected
    ? 'var(--graph-node-selected)'
    : isAdjacent
      ? 'var(--graph-node-adjacent)'
      : 'var(--graph-node-border)';
  const borderWidth = isSelected || isAdjacent ? 2 : 1;
  const borderStyle = data.imported ? 'dashed' : 'solid';
  const headerColor = useMemo(() => headerColorFor(data.kind), [data.kind]);

  return (
    <div
      data-testid="type-node"
      data-type-name={data.typeName}
      data-imported={data.imported ? 'true' : 'false'}
      data-selected={isSelected ? 'true' : 'false'}
      data-adjacent={isAdjacent ? 'true' : 'false'}
      {...(data.table ? { 'data-table': 'true' } : {})}
      className="contexture-type-node"
      style={{
        minWidth: 180,
        maxWidth: 260,
        borderRadius: 8,
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderWidth,
        borderStyle,
        borderColor,
        boxShadow: '0 2px 10px oklch(0 0 0 / 0.18), 0 0 1px oklch(0 0 0 / 0.15)',
        background: isSelected ? 'var(--graph-node-selected-bg)' : 'transparent',
        opacity: isDimmed ? 0.22 : data.imported ? 0.75 : 1,
        transition: 'opacity 0.15s ease, border-color 0.1s ease',
      }}
    >
      {/* Invisible handles — floating edges use intersection math to find
         the edge crossing point, so actual anchor position doesn't matter. */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, top: '50%', left: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, top: '50%', left: '50%' }}
      />

      <div
        style={{
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--graph-node-header-text)',
          background: headerColor,
          letterSpacing: '0.01em',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.typeName}
        </span>
        {data.table ? (
          <span
            data-testid="type-node-table-badge"
            title="Convex table"
            style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '1px 5px',
              borderRadius: 3,
              background: 'var(--graph-edge-property)',
              color: 'var(--graph-node-header-text)',
              opacity: 0.9,
            }}
          >
            table
          </span>
        ) : (
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              opacity: 0.75,
            }}
          >
            {data.kind === 'discriminatedUnion' ? 'union' : data.kind}
          </span>
        )}
      </div>

      {data.fields.length > 0 && (
        <div
          style={{
            padding: '4px 0',
            background: 'var(--graph-node-body-bg)',
          }}
        >
          {data.fields.map((f) => (
            <button
              type="button"
              key={f.name}
              data-testid="type-node-field"
              data-field-name={f.name}
              onClick={(ev) => onFieldClick(f.name, ev)}
              className="contexture-type-node-field"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '2px 10px',
                fontSize: 10,
                gap: 8,
                width: '100%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>
                {f.name}
                {f.optional ? '?' : ''}
                {f.nullable ? ' | null' : ''}
              </span>
              <span
                style={{
                  color: f.refTarget ? 'var(--graph-edge-property)' : 'var(--muted-foreground)',
                  fontFamily: f.refTarget ? 'inherit' : 'var(--font-mono)',
                  fontSize: 9,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.summary}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
