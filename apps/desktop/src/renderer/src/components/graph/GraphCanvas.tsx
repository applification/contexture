/**
 * GraphCanvas — XYFlow host wired to the undoable store + pure
 * interaction handlers.
 *
 * Key invariants:
 *
 * 1. **Positions live in local ReactFlow state.** The parent holds the
 *    "source of truth" `positions` map (persisted via the layout
 *    sidecar), but on the hot path we drive `useNodesState` directly —
 *    routing every pointer move through the parent caused nodes to
 *    flicker / stack on top of each other before ELK's result landed.
 * 2. **ELK gates on `useNodesInitialized`.** XYFlow measures node DOM
 *    *after* the first paint; running ELK before that yields
 *    zero-sized nodes and a collapsed layout. The pre-pivot canvas
 *    used the same gate.
 * 3. **Structure changes trigger re-layout.** When the set of type
 *    names changes (schema op), we mark layout pending and let the
 *    initialisation-gated effect run ELK again, merging with any
 *    existing parent-held positions.
 * 4. **Selection sync.** Node click → UI store; pane click clears.
 *    Adjacency (neighbour-dimming in `TypeNode`) is computed here on
 *    every render — cheap because it's O(edges).
 */
import {
  applyNodeChanges,
  Background,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeChange,
  type OnNodesChange,
  ReactFlow,
  type ReactFlowProps,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useELKLayout } from '../../hooks/useELKLayout';
import type { Op } from '../../store/ops';
import { useUIStore } from '../../store/ui';
import { useUndoStore } from '../../store/undo';
import { RefEdge } from './edges/RefEdge';
import {
  type ConnectPayload,
  handleConnect,
  handleDoubleClick,
  handleKeyDown,
  type KeyEvent as InteractionKeyEvent,
} from './interactions';
import { GroupNode } from './nodes/GroupNode';
import { TypeNode } from './nodes/TypeNode';
import { type BuildGraphResult, buildGraph, type RefEdgeData } from './schema-to-graph';

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface GraphCanvasProps {
  positions?: Record<string, CanvasPosition>;
  onPositionsChange?: (next: Record<string, CanvasPosition>) => void;
}

const NODE_TYPES = { type: TypeNode, group: GroupNode } as const;
const EDGE_TYPES = { ref: RefEdge } as const;

export function GraphCanvas(props: GraphCanvasProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasInner({ positions, onPositionsChange }: GraphCanvasProps): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const dispatch = useCallback((op: Op) => {
    useUndoStore.getState().apply(op);
  }, []);
  const undo = useCallback(() => useUndoStore.getState().undo(), []);
  const redo = useCallback(() => useUndoStore.getState().redo(), []);

  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const setAdjacency = useUIStore((s) => s.setAdjacency);

  const { nodes: builtNodes, edges: builtEdges }: BuildGraphResult = useMemo(
    () => buildGraph({ schema, positions }),
    [schema, positions],
  );

  const [nodes, setNodes] = useState<Node[]>(builtNodes);
  const [edges, setEdges] = useState<Edge[]>(builtEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // When the IR changes, merge new structure onto the current local
  // positions so node drag state isn't blown away on every keystroke.
  // Structural changes (added / removed types) flip layoutPending so
  // the initialisation-gated effect re-runs ELK.
  const layoutPendingRef = useRef(true);
  const prevIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const newIds = new Set(builtNodes.map((n) => n.id));
    const prev = prevIdsRef.current;
    const structureChanged =
      builtNodes.some((n) => !prev.has(n.id)) || [...prev].some((id) => !newIds.has(id));
    prevIdsRef.current = newIds;

    // Merge: keep existing in-memory positions (user drags) + data
    // updates from the rebuilt nodes.
    const liveById = new Map(nodesRef.current.map((n) => [n.id, n]));
    const merged = builtNodes.map((n) => {
      const live = liveById.get(n.id);
      return live ? { ...n, position: live.position } : n;
    });
    setNodes(merged);
    setEdges(builtEdges);

    if (structureChanged) layoutPendingRef.current = true;
  }, [builtNodes, builtEdges]);

  // ELK once the nodes have measured DOM dimensions.
  const { runLayout } = useELKLayout();
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized({ includeHiddenNodes: false });

  /*
   * Layout only re-runs on structural schema changes (tracked via
   * `layoutPendingRef`). The deps array listed below is what biome
   * wants, but the gate is the ref — not the deps — so extra re-entries
   * are cheap (they short-circuit on `!layoutPendingRef.current`).
   */
  useEffect(() => {
    if (!nodesInitialized || !layoutPendingRef.current) return;
    layoutPendingRef.current = false;

    const toLayout = nodesRef.current.filter((n) => n.type !== 'group');
    if (toLayout.length === 0) return;

    let cancelled = false;
    runLayout(toLayout, edgesRef.current).then((result) => {
      if (cancelled || result.length === 0) return;
      const positionById = new Map(result.map((p) => [p.id, { x: p.x, y: p.y }]));
      // Sidecar / parent-held positions win — a user's persisted drag
      // beats a fresh auto-layout run.
      if (positions) {
        for (const [id, p] of Object.entries(positions)) positionById.set(id, p);
      }
      setNodes((prev) =>
        prev.map((n) => {
          const p = positionById.get(n.id);
          return p ? { ...n, position: p } : n;
        }),
      );
      // Persist the newly computed positions so next reload is instant.
      const next: Record<string, CanvasPosition> = { ...(positions ?? {}) };
      positionById.forEach((p, id) => {
        next[id] = p;
      });
      onPositionsChange?.(next);
      // Let XYFlow frame everything after positions land.
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
    });
    return () => {
      cancelled = true;
    };
  }, [nodesInitialized, positions, onPositionsChange, fitView, runLayout]);

  // Selection → adjacency dimming.
  useEffect(() => {
    if (!selectedNodeId) {
      setAdjacency([], []);
      return;
    }
    const neighbourIds = new Set<string>();
    const edgeIds: string[] = [];
    for (const e of edges) {
      if (e.source === selectedNodeId) {
        neighbourIds.add(e.target);
        edgeIds.push(e.id);
      } else if (e.target === selectedNodeId) {
        neighbourIds.add(e.source);
        edgeIds.push(e.id);
      }
    }
    setAdjacency([...neighbourIds], edgeIds);
  }, [selectedNodeId, edges, setAdjacency]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns) as Node[]);
      // Persist final positions on drag-stop only.
      const stops = changes.filter(
        (c) => c.type === 'position' && (c as { dragging?: boolean }).dragging === false,
      ) as Array<{ type: 'position'; id: string; position?: CanvasPosition }>;
      if (stops.length === 0 || !onPositionsChange) return;
      const next: Record<string, CanvasPosition> = { ...(positions ?? {}) };
      for (const c of stops) if (c.position) next[c.id] = c.position;
      onPositionsChange(next);
    },
    [positions, onPositionsChange],
  );

  const flow = useReactFlow();

  const onPaneDoubleClick: ReactFlowProps['onDoubleClick'] = useCallback(
    (event: React.MouseEvent) => {
      // Only react on the pane itself; double-clicking a node shouldn't
      // add a new type.
      const target = event.target as HTMLElement;
      if (target.closest('[data-testid="type-node"]')) return;
      const op = handleDoubleClick(useUndoStore.getState().schema);
      dispatch(op);
      if (op.kind !== 'add_type') return;
      const pos = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onPositionsChange?.({ ...(positions ?? {}), [op.type.name]: pos });
    },
    [dispatch, flow, onPositionsChange, positions],
  );

  const onConnect: ReactFlowProps['onConnect'] = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      const sourceFieldName = connection.sourceHandle ?? '';
      const payload: ConnectPayload = {
        sourceTypeName: connection.source,
        sourceFieldName,
        targetTypeName: connection.target,
      };
      const op = handleConnect(payload);
      if (op) dispatch(op);
    },
    [dispatch],
  );

  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLDivElement>) => {
      const e: InteractionKeyEvent = {
        key: ev.key,
        metaKey: ev.metaKey,
        ctrlKey: ev.ctrlKey,
        shiftKey: ev.shiftKey,
      };
      const selection = { typeName: selectedNodeId ?? undefined };
      const action = handleKeyDown(e, selection);
      if (!action) return;
      ev.preventDefault();
      if (action.kind === 'op') dispatch(action.op);
      else if (action.command === 'undo') undo();
      else if (action.command === 'redo') redo();
    },
    [dispatch, undo, redo, selectedNodeId],
  );

  return (
    <section
      aria-label="Schema canvas"
      className="w-full h-full outline-none"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: canvas receives keydown for delete / undo / redo shortcuts
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="graph-canvas"
      style={{ background: 'var(--graph-bg)' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onDoubleClick={onPaneDoubleClick}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        onEdgeClick={(_, edge) => {
          const data = edge.data as RefEdgeData | undefined;
          if (data) setSelectedNode(data.sourceType);
        }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2.5}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            if (node.id === selectedNodeId) return 'var(--graph-node-selected)';
            return 'var(--graph-node-class, var(--primary))';
          }}
          maskColor="oklch(0 0 0 / 0.45)"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        />
      </ReactFlow>
    </section>
  );
}
