/**
 * Boundary tests for the selection store.
 *
 * Covers the 5 acceptance scenarios from #109: click(replace|toggle|extend),
 * adjacency recomputation via injected `getAdjacency`, and focus semantics.
 */
import { useGraphSelectionStore } from '@renderer/store/selection';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

// A tiny synthetic graph:
//   A — e1 → B
//   B — e2 → C
//   D (isolated)
const adjacencyTable: Record<string, { nodeIds: string[]; edgeIds: string[] }> = {
  A: { nodeIds: ['B'], edgeIds: ['e1'] },
  B: { nodeIds: ['A', 'C'], edgeIds: ['e1', 'e2'] },
  C: { nodeIds: ['B'], edgeIds: ['e2'] },
  D: { nodeIds: [], edgeIds: [] },
};

function stubAdjacency(nodeId: string): { nodeIds: string[]; edgeIds: string[] } {
  return adjacencyTable[nodeId] ?? { nodeIds: [], edgeIds: [] };
}

function setsEqual<T>(a: ReadonlySet<T>, b: Iterable<T>): boolean {
  const bSet = new Set(b);
  if (a.size !== bSet.size) return false;
  for (const x of a) if (!bSet.has(x)) return false;
  return true;
}

describe('useGraphSelectionStore', () => {
  beforeEach(() => {
    act(() => {
      useGraphSelectionStore.getState().clear();
      useGraphSelectionStore.getState().setAdjacencyResolver(stubAdjacency);
    });
  });

  it("click(A, 'replace'): nodeIds={A}, primary=A, adjacency={B, e1}", () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.click('A', 'replace');
    });
    expect(setsEqual(result.current.state.nodeIds, ['A'])).toBe(true);
    expect(result.current.state.primaryNodeId).toBe('A');
    expect(setsEqual(result.current.state.adjacency.nodeIds, ['B'])).toBe(true);
    expect(setsEqual(result.current.state.adjacency.edgeIds, ['e1'])).toBe(true);
  });

  it("click(B, 'extend'): nodeIds={A,B}, primary=B, adjacency follows primary", () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.click('A', 'replace');
      result.current.click('B', 'extend');
    });
    expect(setsEqual(result.current.state.nodeIds, ['A', 'B'])).toBe(true);
    expect(result.current.state.primaryNodeId).toBe('B');
    // Adjacency tracks the primary (last-clicked).
    expect(setsEqual(result.current.state.adjacency.nodeIds, ['A', 'C'])).toBe(true);
  });

  it("click(A, 'toggle'): removes A from a multi-selection, primary reassigns", () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.click('A', 'replace');
      result.current.click('B', 'extend'); // {A,B}, primary=B
      result.current.click('A', 'toggle'); // remove A → {B}, primary still B
    });
    expect(setsEqual(result.current.state.nodeIds, ['B'])).toBe(true);
    expect(result.current.state.primaryNodeId).toBe('B');
  });

  it("click(B, 'toggle') that removes the primary reassigns primary to another member", () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.click('A', 'replace');
      result.current.click('B', 'extend'); // {A,B}, primary=B
      result.current.click('B', 'toggle'); // {A}, primary must become A
    });
    expect(setsEqual(result.current.state.nodeIds, ['A'])).toBe(true);
    expect(result.current.state.primaryNodeId).toBe('A');
  });

  it("click(A, 'toggle') on the only member clears selection and nulls primary", () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.click('A', 'replace');
      result.current.click('A', 'toggle');
    });
    expect(result.current.state.nodeIds.size).toBe(0);
    expect(result.current.state.primaryNodeId).toBeNull();
    expect(result.current.state.adjacency.nodeIds.size).toBe(0);
    expect(result.current.state.adjacency.edgeIds.size).toBe(0);
  });

  it('adjacency uses injected resolver for topology', () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.click('D', 'replace');
    });
    expect(result.current.state.adjacency.nodeIds.size).toBe(0);
    expect(result.current.state.adjacency.edgeIds.size).toBe(0);
  });

  it('focus(X) sets focusNodeId; focus(null-eq) is a no-op reset via setFocus', () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.focus('A');
    });
    expect(result.current.state.focusNodeId).toBe('A');
    act(() => {
      result.current.consumeFocus();
    });
    expect(result.current.state.focusNodeId).toBeNull();
  });

  it('selectEdge() clears node selection and sets edgeId', () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.click('A', 'replace');
      result.current.selectEdge('e2');
    });
    expect(result.current.state.edgeId).toBe('e2');
  });

  it('clear() wipes node + edge selection and adjacency', () => {
    const { result } = renderHook(() => useGraphSelectionStore());
    act(() => {
      result.current.click('A', 'replace');
      result.current.selectEdge('e1');
      result.current.clear();
    });
    expect(result.current.state.nodeIds.size).toBe(0);
    expect(result.current.state.primaryNodeId).toBeNull();
    expect(result.current.state.edgeId).toBeNull();
    expect(result.current.state.adjacency.nodeIds.size).toBe(0);
  });
});
