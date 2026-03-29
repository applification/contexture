import { type InternalNode, Position } from '@xyflow/react';

// Find where the line from this node's center toward the target intersects the node's border
function getNodeIntersection(node: InternalNode, target: InternalNode) {
  const { width = 0, height = 0 } = node.measured ?? {};
  const { x, y } = node.internals.positionAbsolute;
  const cx = x + width / 2;
  const cy = y + height / 2;

  const { x: tx, y: ty } = target.internals.positionAbsolute;
  const tw = target.measured?.width ?? 0;
  const th = target.measured?.height ?? 0;
  const tcx = tx + tw / 2;
  const tcy = ty + th / 2;

  const hw = width / 2;
  const hh = height / 2;

  // Normalise direction vector to find intersection with rectangle
  const xx1 = (tcx - cx) / (2 * hw) - (tcy - cy) / (2 * hh);
  const yy1 = (tcx - cx) / (2 * hw) + (tcy - cy) / (2 * hh);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return {
    x: hw * (xx3 + yy3) + cx,
    y: hh * (-xx3 + yy3) + cy,
  };
}

function getEdgePosition(node: InternalNode, point: { x: number; y: number }): Position {
  const { x, y } = node.internals.positionAbsolute;
  const { width = 0, height = 0 } = node.measured ?? {};

  const px = Math.round(point.x);
  const py = Math.round(point.y);
  const nx = Math.round(x);
  const ny = Math.round(y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + height - 1) return Position.Bottom;
  return Position.Top;
}

export interface FloatingEdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePosition: Position;
  targetPosition: Position;
}

export function getFloatingEdgeParams(
  source: InternalNode,
  target: InternalNode,
): FloatingEdgeParams {
  const sourceIntersection = getNodeIntersection(source, target);
  const targetIntersection = getNodeIntersection(target, source);
  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
    sourcePosition: getEdgePosition(source, sourceIntersection),
    targetPosition: getEdgePosition(target, targetIntersection),
  };
}
