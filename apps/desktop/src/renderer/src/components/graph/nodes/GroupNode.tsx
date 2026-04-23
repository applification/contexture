/**
 * GroupNode — visual grouping container retained from the pre-pivot canvas.
 *
 * Groups are purely presentational: they don't live in the IR and have no
 * effect on validation, emitters, or refs. Layout sidecar persists them
 * so users can keep their organisational boxes across reloads. #93 wires
 * resize/move interactions; #92 only needs the render shape.
 */
import { memo } from 'react';

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  width: number;
  height: number;
}

export const GroupNode = memo(function GroupNode(props: { data: GroupNodeData }) {
  const { data } = props;
  return (
    <div
      data-testid="group-node"
      className="rounded-md border border-border bg-muted/20"
      style={{ width: data.width, height: data.height }}
    >
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{data.label}</div>
    </div>
  );
});
