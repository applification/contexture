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
 *    zero-sized nodes and a collapsed layout.
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
import { validate } from '@renderer/services/validation';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useELKLayout } from '../../hooks/useELKLayout';
import { useGraphLayoutStore } from '../../store/layout-config';
import type { Op } from '../../store/ops';
import {
  clickModeFromEvent,
  type GraphFocusTarget,
  useGraphSelectionStore,
} from '../../store/selection';
import { useUIChromeStore } from '../../store/ui-chrome';
import { useUndoStore } from '../../store/undo';
import { FOCUS_TYPE_NAME_EVENT } from '../detail/TypeDetail';
import { TYPE_EDGE_SELECT_EVENT } from './edge-select-event';
import { RefEdge } from './edges/RefEdge';
import { GraphLegend } from './GraphLegend';
import { filterGraphView } from './graph-view';
import {
  type ConnectPayload,
  createFieldOp,
  handleConnect,
  handleDoubleClick,
  handleKeyDown,
  type KeyEvent as InteractionKeyEvent,
} from './interactions';
import { GroupNode } from './nodes/GroupNode';
import { TYPE_NODE_ADD_FIELD_EVENT, TypeNode } from './nodes/TypeNode';
import { type FieldRefPreview, TYPE_NODE_REF_PREVIEW_EVENT } from './ref-preview-event';
import {
  type BuildGraphResult,
  buildGraph,
  type FieldRow,
  type RefEdgeData,
  type TypeNodeData,
} from './schema-to-graph';

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface GraphCanvasProps {
  positions?: Record<string, CanvasPosition>;
  onPositionsChange?: (next: Record<string, CanvasPosition>) => void;
  highlightedNodeIds?: string[];
}

const NODE_TYPES = { type: TypeNode, group: GroupNode } as const;
const EDGE_TYPES = { ref: RefEdge } as const;

type RefPreview = Omit<FieldRefPreview, 'active'>;
type FocusedField = { nodeId: string; fieldName: string };

export function focusedFieldFromTarget(target: GraphFocusTarget): FocusedField | null {
  return target.fieldName ? { nodeId: target.nodeId, fieldName: target.fieldName } : null;
}

export function applyValidationHighlights(
  graph: BuildGraphResult,
  errors: readonly { path: string }[],
): BuildGraphResult {
  if (errors.length === 0) return graph;

  const typeIssueCounts = new Map<number, number>();
  const fieldIssueCounts = new Map<string, number>();

  for (const error of errors) {
    const typeMatch = error.path.match(/^types\.(\d+)/u);
    if (!typeMatch) continue;
    const typeIndex = Number(typeMatch[1]);
    typeIssueCounts.set(typeIndex, (typeIssueCounts.get(typeIndex) ?? 0) + 1);

    const fieldMatch = error.path.match(/^types\.\d+\.fields\.(\d+)/u);
    if (fieldMatch) {
      const key = `${typeIndex}:${Number(fieldMatch[1])}`;
      fieldIssueCounts.set(key, (fieldIssueCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.type !== 'type') return node;
      const typeIndex = node.data.schemaIndex;
      if (typeIndex === undefined) return node;
      const validationIssueCount = typeIssueCounts.get(typeIndex) ?? 0;
      if (validationIssueCount === 0) return node;
      return {
        ...node,
        data: {
          ...node.data,
          validationIssueCount,
          fields: node.data.fields.map((field: FieldRow, fieldIndex: number) => ({
            ...field,
            validationIssueCount: fieldIssueCounts.get(`${typeIndex}:${fieldIndex}`) ?? undefined,
          })),
        } satisfies TypeNodeData,
      };
    }),
  };
}

export function GraphCanvas(props: GraphCanvasProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasInner({
  positions,
  onPositionsChange,
  highlightedNodeIds = [],
}: GraphCanvasProps): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const dispatch = useCallback((op: Op) => {
    useUndoStore.getState().apply(op);
  }, []);
  const undo = useCallback(() => useUndoStore.getState().undo(), []);
  const redo = useCallback(() => useUndoStore.getState().redo(), []);

  const click = useGraphSelectionStore((s) => s.click);
  const selectEdge = useGraphSelectionStore((s) => s.selectEdge);
  const clearNodes = useGraphSelectionStore((s) => s.clearNodes);
  const selectedNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
  const setAdjacencyResolver = useGraphSelectionStore((s) => s.setAdjacencyResolver);
  const focusTarget = useGraphSelectionStore((s) => s.state.focusTarget);
  const consumeFocus = useGraphSelectionStore((s) => s.consumeFocus);
  const setSidebarTab = useUIChromeStore((s) => s.setSidebarTab);
  const setSidebarVisible = useUIChromeStore((s) => s.setSidebarVisible);

  const validationErrors = useMemo(() => validate(schema, { stdlib: STDLIB_REGISTRY }), [schema]);

  const { nodes: builtNodes, edges: builtEdges }: BuildGraphResult = useMemo(() => {
    const highlighted = new Set(highlightedNodeIds);
    const graph = applyValidationHighlights(buildGraph({ schema, positions }), validationErrors);
    return {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.type === 'type'
          ? { ...node, data: { ...node.data, syncHighlighted: highlighted.has(node.id) } }
          : node,
      ),
    };
  }, [schema, positions, highlightedNodeIds, validationErrors]);

  const graphLayout = useGraphLayoutStore((s) => s.graphLayout);
  const showEnums = graphLayout.showEnums;
  const [refPreview, setRefPreview] = useState<RefPreview | null>(null);
  const refPreviewClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedField, setFocusedField] = useState<{ nodeId: string; fieldName: string } | null>(
    null,
  );
  const focusedFieldClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { nodes: visibleBuiltNodes, edges: visibleBuiltEdges } = useMemo(() => {
    const visible = filterGraphView({ nodes: builtNodes, edges: builtEdges }, { showEnums });
    const visibleWithFocusedField = focusedField
      ? {
          ...visible,
          nodes: visible.nodes.map((node) =>
            node.id === focusedField.nodeId
              ? { ...node, data: { ...node.data, focusedFieldName: focusedField.fieldName } }
              : node,
          ),
        }
      : visible;
    if (!refPreview) return visibleWithFocusedField;
    if (!visibleWithFocusedField.nodes.some((node) => node.id === refPreview.targetType)) {
      return visibleWithFocusedField;
    }
    const previewNodeIds = new Set<string>([refPreview.targetType]);
    const previewEdgeIds = new Set<string>();
    for (const edge of visible.edges) {
      if (edge.source !== refPreview.targetType && edge.target !== refPreview.targetType) continue;
      previewEdgeIds.add(edge.id);
      previewNodeIds.add(edge.source);
      previewNodeIds.add(edge.target);
    }
    return {
      nodes: visibleWithFocusedField.nodes.map((node) =>
        previewNodeIds.has(node.id)
          ? {
              ...node,
              data: {
                ...node.data,
                previewRole: node.id === refPreview.targetType ? 'primary' : 'adjacent',
              },
            }
          : { ...node, data: { ...node.data, previewDimmed: true } },
      ),
      edges: visibleWithFocusedField.edges.map((edge) => {
        return previewEdgeIds.has(edge.id)
          ? { ...edge, data: { ...edge.data, previewHighlighted: true } }
          : { ...edge, data: { ...edge.data, previewDimmed: true } };
      }),
    };
  }, [builtNodes, builtEdges, showEnums, refPreview, focusedField]);

  const [nodes, setNodes] = useState<Node[]>(visibleBuiltNodes);
  const [edges, setEdges] = useState<Edge[]>(visibleBuiltEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const builtNodesRef = useRef(builtNodes);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  builtNodesRef.current = builtNodes;

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
    const merged = visibleBuiltNodes.map((n) => {
      const live = liveById.get(n.id);
      return live ? { ...n, position: live.position } : n;
    });
    setNodes(merged);
    setEdges(visibleBuiltEdges);

    if (structureChanged) layoutPendingRef.current = true;
  }, [builtNodes, visibleBuiltNodes, visibleBuiltEdges]);

  useEffect(() => {
    if (showEnums || !selectedNodeId) return;
    const selectedNode = builtNodes.find((node) => node.id === selectedNodeId);
    if (selectedNode?.data.kind === 'enum' && !selectedNode.data.imported) clearNodes();
  }, [builtNodes, clearNodes, selectedNodeId, showEnums]);

  // ELK once the nodes have measured DOM dimensions.
  const { runLayout } = useELKLayout();
  const { fitView, setCenter } = useReactFlow();
  const nodesInitialized = useNodesInitialized({ includeHiddenNodes: false });
  const graphLayoutRef = useRef(graphLayout);
  graphLayoutRef.current = graphLayout;
  // Keep refs for callbacks triggered outside React (custom events).
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const onPositionsChangeRef = useRef(onPositionsChange);
  onPositionsChangeRef.current = onPositionsChange;

  // One shared layout runner — respects the `respectSidecar` flag so
  // the top-left "Re-layout" button can stomp on persisted positions
  // while the initial-load path preserves them.
  const runLayoutNow = useCallback(
    async (respectSidecar: boolean) => {
      const toLayout = nodesRef.current.filter((n) => n.type !== 'group');
      if (toLayout.length === 0) return;
      const result = await runLayout(toLayout, edgesRef.current, graphLayoutRef.current);
      if (result.length === 0) return;
      const positionById = new Map(result.map((p) => [p.id, { x: p.x, y: p.y }]));
      // Preserve user-held positions only on the initial auto-layout —
      // a manual Re-layout re-runs ELK without the override.
      if (respectSidecar && positionsRef.current) {
        for (const [id, p] of Object.entries(positionsRef.current)) positionById.set(id, p);
      }
      setNodes((prev) =>
        prev.map((n) => {
          const p = positionById.get(n.id);
          return p ? { ...n, position: p } : n;
        }),
      );
      const visibleNodeIds = new Set(nodesRef.current.map((n) => n.id));
      const next: Record<string, CanvasPosition> = respectSidecar
        ? { ...(positionsRef.current ?? {}) }
        : Object.fromEntries(
            builtNodesRef.current
              .filter((n) => !visibleNodeIds.has(n.id))
              .map((n) => [n.id, positionsRef.current?.[n.id] ?? n.position]),
          );
      positionById.forEach((p, id) => {
        next[id] = p;
      });
      onPositionsChangeRef.current?.(next);
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
    },
    [runLayout, fitView],
  );

  /*
   * Initial layout: run once the measurements are in and the schema
   * has changed structurally (tracked by `layoutPendingRef`).
   */
  useEffect(() => {
    if (!nodesInitialized || !layoutPendingRef.current) return;
    layoutPendingRef.current = false;
    void runLayoutNow(true);
  }, [nodesInitialized, runLayoutNow]);

  // Subscribe to the GraphControls bus events.
  useEffect(() => {
    function onRelayout(): void {
      void runLayoutNow(false);
    }
    function onFitView(): void {
      fitView({ padding: 0.15, duration: 400 });
    }
    document.addEventListener('graph:relayout', onRelayout);
    document.addEventListener('graph:fitview', onFitView);
    return () => {
      document.removeEventListener('graph:relayout', onRelayout);
      document.removeEventListener('graph:fitview', onFitView);
    };
  }, [runLayoutNow, fitView]);

  // Search → centre the matched node and select it. `focusTarget` is
  // the trigger; we consume the value so repeated picks of the same
  // name still re-centre.
  useEffect(() => {
    if (!focusTarget) return;
    const node = nodesRef.current.find((n) => n.id === focusTarget.nodeId);
    if (!node) {
      consumeFocus();
      return;
    }
    const width = node.measured?.width ?? node.width ?? 180;
    const height = node.measured?.height ?? node.height ?? 60;
    const cx = node.position.x + width / 2;
    const cy = node.position.y + height / 2;
    setCenter(cx, cy, { zoom: 1.1, duration: 400 });
    click(focusTarget.nodeId, 'replace');
    const nextFocusedField = focusedFieldFromTarget(focusTarget);
    if (focusedFieldClearTimer.current) {
      clearTimeout(focusedFieldClearTimer.current);
      focusedFieldClearTimer.current = null;
    }
    setFocusedField(nextFocusedField);
    if (nextFocusedField) {
      focusedFieldClearTimer.current = setTimeout(() => setFocusedField(null), 1600);
    }
    consumeFocus();
  }, [focusTarget, setCenter, click, consumeFocus]);

  // Register an adjacency resolver against the current edges so the
  // selection store's `click()` can compute dim-sets without reaching
  // into React Flow directly.
  useEffect(() => {
    setAdjacencyResolver((nodeId) => {
      const nodeIds: string[] = [];
      const edgeIds: string[] = [];
      for (const e of edges) {
        if (e.source === nodeId) {
          nodeIds.push(e.target);
          edgeIds.push(e.id);
        } else if (e.target === nodeId) {
          nodeIds.push(e.source);
          edgeIds.push(e.id);
        }
      }
      return { nodeIds, edgeIds };
    });
  }, [edges, setAdjacencyResolver]);

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

  const addFieldFromNode = useCallback(
    (typeName: string): void => {
      const op = createFieldOp(useUndoStore.getState().schema, typeName);
      if (!op || op.kind !== 'add_field') return;
      const result = useUndoStore.getState().apply(op);
      if ('error' in result) return;
      click(typeName, 'replace');
      useGraphSelectionStore.getState().focus({ nodeId: typeName, fieldName: op.field.name });
      setSidebarVisible(true);
      setSidebarTab('properties');
    },
    [click, setSidebarTab, setSidebarVisible],
  );

  const focusSelectedTypeName = useCallback((): void => {
    if (!selectedNodeId) return;
    setSidebarVisible(true);
    setSidebarTab('properties');
    setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent(FOCUS_TYPE_NAME_EVENT, { detail: { typeName: selectedNodeId } }),
      );
    }, 0);
  }, [selectedNodeId, setSidebarTab, setSidebarVisible]);

  // Double-click a node → focus its properties in the sidebar.
  const onNodeDoubleClick: ReactFlowProps['onNodeDoubleClick'] = useCallback(
    (_event, node) => {
      click(node.id, 'replace');
      setSidebarVisible(true);
      setSidebarTab('properties');
    },
    [click, setSidebarVisible, setSidebarTab],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (ev: KeyboardEvent): void => {
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
      else if (action.command === 'rename') focusSelectedTypeName();
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [dispatch, undo, redo, selectedNodeId, focusSelectedTypeName]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (ev: Event): void => {
      const detail = (ev as CustomEvent<{ typeName?: unknown }>).detail;
      if (typeof detail?.typeName !== 'string') return;
      addFieldFromNode(detail.typeName);
    };
    el.addEventListener(TYPE_NODE_ADD_FIELD_EVENT, handler);
    return () => el.removeEventListener(TYPE_NODE_ADD_FIELD_EVENT, handler);
  }, [addFieldFromNode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (ev: Event): void => {
      const detail = (ev as CustomEvent<FieldRefPreview>).detail;
      if (refPreviewClearTimer.current) {
        clearTimeout(refPreviewClearTimer.current);
        refPreviewClearTimer.current = null;
      }
      if (detail.active) {
        setRefPreview((prev) => {
          if (
            prev?.sourceType === detail.sourceType &&
            prev.sourceField === detail.sourceField &&
            prev.targetType === detail.targetType
          ) {
            return prev;
          }
          return {
            sourceType: detail.sourceType,
            sourceField: detail.sourceField,
            targetType: detail.targetType,
          };
        });
        return;
      }
      refPreviewClearTimer.current = setTimeout(() => {
        setRefPreview((prev) =>
          prev?.sourceType === detail.sourceType &&
          prev.sourceField === detail.sourceField &&
          prev.targetType === detail.targetType
            ? null
            : prev,
        );
      }, 80);
    };
    document.addEventListener(TYPE_NODE_REF_PREVIEW_EVENT, handler);
    return () => {
      if (refPreviewClearTimer.current) clearTimeout(refPreviewClearTimer.current);
      if (focusedFieldClearTimer.current) clearTimeout(focusedFieldClearTimer.current);
      document.removeEventListener(TYPE_NODE_REF_PREVIEW_EVENT, handler);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full outline-none"
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
        onNodeClick={(evt, node) => {
          click(node.id, clickModeFromEvent(evt));
        }}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={() => clearNodes()}
        onEdgeClick={(_, edge) => {
          const data = edge.data as RefEdgeData | undefined;
          if (!data) return;
          click(data.sourceType, 'replace');
          selectEdge(edge.id);
          document.dispatchEvent(
            new CustomEvent(TYPE_EDGE_SELECT_EVENT, { detail: { edgeId: edge.id, data } }),
          );
        }}
        minZoom={0.1}
        maxZoom={2.5}
        attributionPosition="bottom-left"
      >
        {/* Subtle dot grid — gap + tiny size + themed colour so the
            pattern reads as texture not noise on both light and dark. */}
        <Background gap={28} size={0.8} color="var(--graph-dot)" />
        <Controls showInteractive={false} />
        <GraphLegend showEnumNodes={showEnums} />
      </ReactFlow>
    </div>
  );
}
