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
import type { RefEdgeData } from '../components/graph/schema-to-graph';

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
  selectedField: FieldSelection | null;
  selectedEdge: EdgeSelection | null;
  adjacency: AdjacencySet;
  /** Target for "reveal in graph" from search — consumed by the canvas. */
  focusTarget: GraphFocusTarget | null;
}

export interface GraphFocusTarget {
  nodeId: string;
  fieldName?: string;
}

export interface FieldSelection {
  typeName: string;
  fieldName: string;
}

export interface EdgeSelection {
  edgeId: string;
  data: RefEdgeData;
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
  selectedField: null,
  selectedEdge: null,
  adjacency: EMPTY_ADJACENCY,
  focusTarget: null,
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
  selectField(field: FieldSelection | null): void;
  selectEdge(edge: EdgeSelection | null): void;
  focus(target: string | GraphFocusTarget): void;
  selectFocusedNode(nodeId: string): void;
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
          selectedField: null,
          selectedEdge: null,
          adjacency: adjacencyFor(primary),
        },
      });
    },

    selectField(field) {
      set((s) => ({
        state: {
          ...s.state,
          nodeIds: field ? new Set([field.typeName]) : s.state.nodeIds,
          primaryNodeId: field ? field.typeName : s.state.primaryNodeId,
          edgeId: null,
          selectedField: field,
          selectedEdge: null,
          adjacency: field ? adjacencyFor(field.typeName) : s.state.adjacency,
        },
      }));
    },

    selectEdge(edge) {
      set((s) => ({
        state: {
          ...s.state,
          nodeIds: edge ? new Set([edge.data.sourceType]) : s.state.nodeIds,
          primaryNodeId: edge ? edge.data.sourceType : s.state.primaryNodeId,
          edgeId: edge?.edgeId ?? null,
          selectedEdge: edge,
          selectedField: edge ? null : s.state.selectedField,
          adjacency: edge ? adjacencyFor(edge.data.sourceType) : s.state.adjacency,
        },
      }));
    },

    focus(target) {
      set((s) => ({
        state: {
          ...s.state,
          focusTarget: typeof target === 'string' ? { nodeId: target } : target,
        },
      }));
    },

    selectFocusedNode(nodeId) {
      set((s) => {
        const prev = s.state;
        return {
          state: {
            ...prev,
            nodeIds: new Set([nodeId]),
            primaryNodeId: nodeId,
            edgeId: null,
            selectedEdge: null,
            selectedField: prev.selectedField?.typeName === nodeId ? prev.selectedField : null,
            adjacency: adjacencyFor(nodeId),
          },
        };
      });
    },

    consumeFocus() {
      set((s) => ({ state: { ...s.state, focusTarget: null } }));
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
          edgeId: null,
          selectedField: null,
          selectedEdge: null,
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
