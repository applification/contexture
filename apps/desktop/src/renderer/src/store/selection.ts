/**
 * Graph selection store.
 *
 * Owns node/edge selection state plus the adjacency dimming set that the
 * graph uses to fade unrelated nodes. The store's deep-module move is the
 * `click(id, mode)` method: it folds modifier-key semantics, primary
 * reassignment, and adjacency recomputation into one call so callers
 * don't have to (a) branch on modifier keys and (b) separately invoke
 * `setAdjacency` after each selection mutation.
 *
 * Adjacency resolution is injected — the graph canvas registers a
 * resolver tied to its current edges list via `setAdjacencyResolver`.
 * This keeps the store decoupled from React Flow and lets tests stub
 * the topology directly.
 */
import { create } from 'zustand';

export type ClickMode = 'replace' | 'toggle' | 'extend';

export interface AdjacencySet {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

export interface GraphSelectionState {
  nodeIds: ReadonlySet<string>;
  /** Last-clicked node; the detail panel and adjacency follow this id. */
  primaryNodeId: string | null;
  edgeId: string | null;
  adjacency: AdjacencySet;
  /** Target for "reveal in graph" from search — consumed by the canvas. */
  focusNodeId: string | null;
}

export type AdjacencyResolver = (nodeId: string) => {
  nodeIds: readonly string[];
  edgeIds: readonly string[];
};

const EMPTY_ADJACENCY: AdjacencySet = {
  nodeIds: new Set<string>(),
  edgeIds: new Set<string>(),
};

const INITIAL_STATE: GraphSelectionState = {
  nodeIds: new Set<string>(),
  primaryNodeId: null,
  edgeId: null,
  adjacency: EMPTY_ADJACENCY,
  focusNodeId: null,
};

const DEFAULT_RESOLVER: AdjacencyResolver = () => ({ nodeIds: [], edgeIds: [] });

/**
 * Modifier-key → click mode. Lives here so every caller (canvas, node,
 * search result, status bar) maps keys the same way.
 */
export function clickModeFromEvent(event: {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): ClickMode {
  if (event.shiftKey) return 'extend';
  if (event.metaKey || event.ctrlKey) return 'toggle';
  return 'replace';
}

interface GraphSelectionStoreShape {
  state: GraphSelectionState;
  click(nodeId: string, mode: ClickMode): void;
  selectEdge(edgeId: string | null): void;
  focus(nodeId: string): void;
  /** Called by the canvas once it has centred on the focus target. */
  consumeFocus(): void;
  clear(): void;
  /** Drop just the primary + adjacency (used on pane-click / Escape). */
  clearNodes(): void;
  setAdjacencyResolver(resolver: AdjacencyResolver): void;
}

export const useGraphSelectionStore = create<GraphSelectionStoreShape>((set, get) => {
  let resolver: AdjacencyResolver = DEFAULT_RESOLVER;

  function adjacencyFor(primary: string | null): AdjacencySet {
    if (!primary) return EMPTY_ADJACENCY;
    const { nodeIds, edgeIds } = resolver(primary);
    return { nodeIds: new Set(nodeIds), edgeIds: new Set(edgeIds) };
  }

  return {
    state: INITIAL_STATE,

    click(nodeId, mode) {
      const prev = get().state;
      const next = new Set(prev.nodeIds);
      let primary: string | null;

      if (mode === 'replace') {
        next.clear();
        next.add(nodeId);
        primary = nodeId;
      } else if (mode === 'extend') {
        next.add(nodeId);
        primary = nodeId;
      } else {
        // toggle
        if (next.has(nodeId)) {
          next.delete(nodeId);
          if (prev.primaryNodeId === nodeId) {
            // Reassign to any remaining member, or null.
            const iterator = next.values();
            const first = iterator.next();
            primary = first.done ? null : first.value;
          } else {
            primary = prev.primaryNodeId;
          }
        } else {
          next.add(nodeId);
          primary = nodeId;
        }
      }

      set({
        state: {
          ...prev,
          nodeIds: next,
          primaryNodeId: primary,
          edgeId: null,
          adjacency: adjacencyFor(primary),
        },
      });
    },

    selectEdge(edgeId) {
      set((s) => ({ state: { ...s.state, edgeId } }));
    },

    focus(nodeId) {
      set((s) => ({ state: { ...s.state, focusNodeId: nodeId } }));
    },

    consumeFocus() {
      set((s) => ({ state: { ...s.state, focusNodeId: null } }));
    },

    clear() {
      set({ state: INITIAL_STATE });
    },

    clearNodes() {
      set((s) => ({
        state: {
          ...s.state,
          nodeIds: new Set<string>(),
          primaryNodeId: null,
          adjacency: EMPTY_ADJACENCY,
        },
      }));
    },

    setAdjacencyResolver(fn) {
      resolver = fn;
      // Recompute adjacency for the current primary against the new
      // topology so listeners see a consistent dim-set.
      const { primaryNodeId } = get().state;
      set((s) => ({ state: { ...s.state, adjacency: adjacencyFor(primaryNodeId) } }));
    },
  };
});
