/**
 * TypeNode — renders one Contexture TypeDef on the canvas.
 *
 * Shape:
 *   ┌───────────────────────┐
 *   │ TypeName   object     │  ← header: type name + kind badge
 *   ├───────────────────────┤
 *   │ fieldA · string       │  ← each field a selectable sub-row,
 *   │ fieldB · → OtherType  │    primitives shown inline
 *   │ fieldC? · number(0–)  │
 *   └───────────────────────┘
 *
 * Fields declared `optional` get a trailing `?`. Refs show as
 * `→ TargetName`. Imported types (external refs surfaced by the adapter)
 * render with a dashed border + muted fill so the user can see the
 * boundary between their schema and stdlib / cross-project refs.
 *
 * Selection is routed through the XYFlow node prop (`selected`) plus
 * a bottom-up callback on the field rows: clicking a field raises a
 * `selectField` detail that the panel routes into `FieldDetail` (#94).
 * #92 only needs the click → selection state flow to exist; the panel
 * lands later.
 */
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { useUIStore } from '../../../store/ui';
import type { TypeNodeData } from '../schema-to-graph';

export interface FieldSelection {
  typeName: string;
  fieldName: string;
}

export const TYPE_NODE_EVENT = 'contexture:field-select' as const;

type TypeNodeKind = Node<TypeNodeData, 'type'>;

export const TypeNode = memo(function TypeNode(props: NodeProps<TypeNodeKind>) {
  const { data, selected } = props;
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);

  const onFieldClick = useCallback(
    (fieldName: string, ev: React.MouseEvent<HTMLElement>) => {
      ev.stopPropagation();
      setSelectedNode(data.typeName);
      // Also emit a DOM event for tests / higher layers that want the
      // field-level selection without reaching into the UI store.
      const detail: FieldSelection = { typeName: data.typeName, fieldName };
      ev.currentTarget.dispatchEvent(new CustomEvent(TYPE_NODE_EVENT, { bubbles: true, detail }));
    },
    [data.typeName, setSelectedNode],
  );

  const borderStyle = data.imported ? 'dashed' : 'solid';
  const opacity = data.imported ? 0.65 : 1;

  return (
    <div
      data-testid="type-node"
      data-type-name={data.typeName}
      data-imported={data.imported ? 'true' : 'false'}
      className="rounded-md bg-background text-foreground shadow-sm"
      style={{
        borderWidth: 1,
        borderStyle,
        borderColor: selected ? 'var(--graph-node-selected)' : 'var(--graph-node-border)',
        minWidth: 200,
        opacity,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="flex items-center justify-between px-2 py-1 border-b border-border text-xs font-medium">
        <span>{data.typeName}</span>
        <span className="text-muted-foreground">{data.kind}</span>
      </div>
      {data.fields.length > 0 && (
        <ul className="py-1 text-xs">
          {data.fields.map((f) => (
            <li
              key={f.name}
              data-testid="type-node-field"
              data-field-name={f.name}
              className="flex items-center justify-between px-2 py-0.5 cursor-pointer hover:bg-accent"
              onClick={(ev) => onFieldClick(f.name, ev)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  onFieldClick(f.name, ev as unknown as React.MouseEvent<HTMLElement>);
                }
              }}
            >
              <span>
                {f.name}
                {f.optional ? '?' : ''}
              </span>
              <span className="text-muted-foreground">{f.summary}</span>
            </li>
          ))}
        </ul>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
});
