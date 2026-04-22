/**
 * GraphCanvas — React wrapper that wires XYFlow events to the pure
 * interaction handlers in `./interactions.ts`.
 *
 * Responsibilities (intentionally thin):
 *   - Convert schema → nodes/edges via `buildGraph` (memoised on the
 *     live IR from the undoable store).
 *   - Subscribe to schema changes and re-render.
 *   - Surface double-click, connect, key, and context-menu events to
 *     the pure handlers and dispatch whatever ops they return.
 *   - Forward selection into the UI store so the detail panel updates
 *     as nodes get clicked.
 *   - Persist user-moved positions into a `positions` state kept in
 *     the parent; parent wires that into the layout sidecar.
 *
 * ELK auto-layout on first load lives in a separate effect that runs
 * when `positions` is empty — it calls `useELKLayout` and seeds the
 * positions. The layout-sidecar hook (`useLayoutSidecar`) is the
 * author's concern; this component just reads/writes `positions` via
 * props.
 */
import {
  applyNodeChanges,
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeChange,
  ReactFlow,
  type ReactFlowProps,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import { type BuildGraphResult, buildGraph } from './schema-to-graph';

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

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasInner({ positions, onPositionsChange }: GraphCanvasProps) {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const dispatch = useCallback((op: Op) => {
    useUndoStore.getState().apply(op);
  }, []);
  const undo = useCallback(() => useUndoStore.getState().undo(), []);
  const redo = useCallback(() => useUndoStore.getState().redo(), []);

  const { setSelectedNode, selectedNodeId } = useUIStore((s) => ({
    setSelectedNode: s.setSelectedNode,
    selectedNodeId: s.selectedNodeId,
  }));

  const { nodes: builtNodes, edges: builtEdges }: BuildGraphResult = useMemo(
    () => buildGraph({ schema, positions }),
    [schema, positions],
  );

  const [nodes, setNodes] = useState<Node[]>(builtNodes);
  const [edges, setEdges] = useState<Edge[]>(builtEdges);

  // Rebuild on schema / position changes.
  useEffect(() => {
    setNodes(builtNodes);
    setEdges(builtEdges);
  }, [builtNodes, builtEdges]);

  // ELK on first open when every node is at (0,0).
  const { runLayout } = useELKLayout();
  useEffect(() => {
    const needsLayout =
      builtNodes.length > 0 && builtNodes.every((n) => n.position.x === 0 && n.position.y === 0);
    if (!needsLayout) return;
    let cancelled = false;
    runLayout(builtNodes, builtEdges).then((result) => {
      if (cancelled || result.length === 0) return;
      const next: Record<string, CanvasPosition> = { ...(positions ?? {}) };
      for (const { id, x, y } of result) next[id] = { x, y };
      onPositionsChange?.(next);
    });
    return () => {
      cancelled = true;
    };
  }, [builtNodes, builtEdges, runLayout, positions, onPositionsChange]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns));
      // Persist final positions on drag-stop.
      const stops = changes.filter(
        (c) => c.type === 'position' && (c as { dragging?: boolean }).dragging === false,
      ) as Array<{ id: string; position?: CanvasPosition; dragging: boolean }>;
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
      // Park the new node near the cursor. `handleDoubleClick` always
      // returns an `add_type` op — narrow so TS sees the `type` field.
      if (op.kind !== 'add_type') return;
      const pos = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onPositionsChange?.({ ...(positions ?? {}), [op.type.name]: pos });
    },
    [dispatch, flow, onPositionsChange, positions],
  );

  const onConnect: ReactFlowProps['onConnect'] = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      // The XYFlow source id is the source type name. Real field-handle
      // ids land in #93's field-handle wiring; for now treat the drag
      // as a whole-node connection that picks the first ref field —
      // or fall back to requiring the user to be dragging from an
      // explicit `sourceHandle` of the form `<fieldName>`.
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
      const selection = {
        typeName: selectedNodeId ?? undefined,
        // Field-level selection on the canvas lives in UI store once #94
        // wiring lands; until then canvas key events operate at the
        // type level.
      };
      const action = handleKeyDown(e, selection);
      if (!action) return;
      ev.preventDefault();
      if (action.kind === 'op') dispatch(action.op);
      else if (action.command === 'undo') undo();
      else if (action.command === 'redo') redo();
      // `rename` command is a UI affordance — picked up by the panel.
    },
    [dispatch, undo, redo, selectedNodeId],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: canvas host wraps ReactFlow and needs keyboard focus to forward Delete/F2/undo/redo
    // biome-ignore lint/a11y/noNoninteractiveTabindex: canvas container needs tabIndex=0 so keyboard events reach it without a native interactive role
    <div className="w-full h-full" tabIndex={0} onKeyDown={onKeyDown} data-testid="graph-canvas">
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
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
