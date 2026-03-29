import { describe, it, expect } from 'vitest';
import { getFloatingEdgeParams } from '@renderer/components/graph/edges/floating-edge-utils';
import { Position } from '@xyflow/react';

function makeNode(x: number, y: number, w: number, h: number) {
  return {
    measured: { width: w, height: h },
    internals: { positionAbsolute: { x, y } },
  } as any;
}

describe('getFloatingEdgeParams', () => {
  it('returns edge params between two nodes', () => {
    const source = makeNode(0, 0, 100, 50);
    const target = makeNode(200, 0, 100, 50);
    const result = getFloatingEdgeParams(source, target);

    expect(typeof result.sx).toBe('number');
    expect(typeof result.sy).toBe('number');
    expect(typeof result.tx).toBe('number');
    expect(typeof result.ty).toBe('number');
    expect(result.sourcePosition).toBeDefined();
    expect(result.targetPosition).toBeDefined();
  });

  it('source exits right side when target is to the right', () => {
    const source = makeNode(0, 0, 100, 50);
    const target = makeNode(300, 0, 100, 50);
    const result = getFloatingEdgeParams(source, target);
    expect(result.sourcePosition).toBe(Position.Right);
    expect(result.targetPosition).toBe(Position.Left);
  });

  it('source exits bottom when target is below', () => {
    const source = makeNode(0, 0, 100, 50);
    const target = makeNode(0, 200, 100, 50);
    const result = getFloatingEdgeParams(source, target);
    expect(result.sourcePosition).toBe(Position.Bottom);
    expect(result.targetPosition).toBe(Position.Top);
  });

  it('handles same position (no movement)', () => {
    const source = makeNode(0, 0, 100, 50);
    const target = makeNode(0, 0, 100, 50);
    const result = getFloatingEdgeParams(source, target);
    expect(typeof result.sx).toBe('number');
    expect(typeof result.sy).toBe('number');
  });

  it('handles diagonal positioning', () => {
    const source = makeNode(0, 0, 100, 100);
    const target = makeNode(200, 200, 100, 100);
    const result = getFloatingEdgeParams(source, target);
    // Source should exit from right or bottom side
    expect([Position.Right, Position.Bottom]).toContain(result.sourcePosition);
  });
});
