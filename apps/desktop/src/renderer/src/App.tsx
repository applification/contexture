/**
 * Contexture app shell.
 *
 * Primary desktop layout:
 *
 *   ┌───────────────────────── Toolbar ─────────────────────────┐
 *   ├────────────────────────────────┬──────────────────────────┤
 *   │   GraphCanvas + Inspector      │ Activity drawer + rail   │
 *   ├──────────────────────────── StatusBar ───┴────────────────┤
 *   └───────────────────────────────────────────────────────────┘
 *
 * Canvas and right workspace sit inside a `ResizablePanelGroup` so the
 * split is drag-adjustable and the workspace can collapse when
 * `useUIChromeStore.sidebarVisible` is false (toggled by the Toolbar's
 * sidebar button).
 */

import { type EvolutionPolicy, getEvolutionPolicy } from '@contexture/core/evolution-policy';
import {
  emitGeneratedTarget,
  enableGeneratedTarget,
  isGeneratedTargetEnabled,
  previewableGeneratedTargets,
  setGeneratedTargetOutputDir,
} from '@contexture/core/generated-targets';
import type { FieldType, Schema, TypeDef } from '@contexture/core/ir';
import { STDLIB_REGISTRY, STDLIB_TYPE_DEFINITIONS } from '@shared/stdlib-registry';
import {
  AlertCircle,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCode2,
  FilePlus2,
  FolderOpen,
  GitCompareArrows,
  Maximize2,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
  MousePointer2,
  Play,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { useSchemaAgentChat } from './chat/useSchemaAgentChat';
import { ActivityBar } from './components/activity-bar/ActivityBar';
import { ChangesPanel } from './components/changes/ChangesPanel';
import { ChatPanel } from './components/chat/ChatPanel';
import { DetailPanel } from './components/detail/DetailPanel';
import { FOCUS_TYPE_NAME_EVENT } from './components/detail/TypeDetail';
import { DocumentDialogs } from './components/dialogs/DocumentDialogs';
import { ReconcileModal } from './components/dialogs/ReconcileModal';
import { EvolutionPolicyPanel } from './components/graph/EvolutionPolicyPanel';
import { TYPE_EDGE_SELECT_EVENT } from './components/graph/edge-select-event';
import { GraphBackground } from './components/graph/GraphBackground';
import { type CanvasPosition, GraphCanvas } from './components/graph/GraphCanvas';
import { GraphLegend } from './components/graph/GraphLegend';
import { type CreateTypeKind, createFieldOp, createTypeOp } from './components/graph/interactions';
import { TYPE_NODE_EVENT } from './components/graph/nodes/TypeNode';
import { DriftBanner } from './components/hud/DriftBanner';
import { ModelSyncBanner } from './components/hud/ModelSyncBanner';
import { PlaygroundPanel } from './components/playground/PlaygroundPanel';
import { ReviewPanel } from './components/review/ReviewPanel';
import {
  AgentSetupContent,
  type SchemaOutputType,
  SchemaPanel,
  type SchemaPanelProps,
  type SchemaPanelSource,
} from './components/schema/SchemaPanel';
import { StatusBar } from './components/status-bar/StatusBar';
import { StdlibPanel } from './components/stdlib/StdlibPanel';
import { GraphControlsPanel } from './components/toolbar/GraphControlsPanel';
import { Toolbar } from './components/toolbar/Toolbar';
import { TypeKindBadge, type TypeKindLabel } from './components/toolbar/type-kind-badge';
import { UpdateBanner } from './components/UpdateBanner';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from './components/ui/alert-dialog';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './components/ui/empty';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './components/ui/resizable';
import { useDrift } from './hooks/useDrift';
import { useFileMenu } from './hooks/useFileMenu';
import { useModelChangeLogRecorder } from './hooks/useModelChangeLogRecorder';
import { useModelSync } from './hooks/useModelSync';
import { useProjectAutoSave } from './hooks/useProjectAutoSave';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import allotment from './samples/allotment.contexture.json' with { type: 'json' };
import { useChatComposerStore } from './store/chat-composer';
import { useConvexVersionStore } from './store/convex-version';
import { useDocumentStore } from './store/document';
import { useDriftStore } from './store/drift';
import { useGraphLayoutStore } from './store/layout-config';
import { useModelSyncStore } from './store/model-sync';
import { usePlaygroundStore } from './store/playground';
import { type EdgeSelection, type FieldSelection, useGraphSelectionStore } from './store/selection';
import { useUIChromeStore } from './store/ui-chrome';
import { useUndoStore } from './store/undo';

export default function App(): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const evolutionPolicy = getEvolutionPolicy(schema);
  const hasSchema = schema.types.length > 0;

  const layout = useDocumentStore((s) => s.layout);
  const setLayout = useDocumentStore((s) => s.setLayout);
  const positions = layout.positions;
  const setPositions = useCallback(
    (nextPositions: Record<string, CanvasPosition>) => {
      setLayout({ version: '1', positions: nextPositions });
    },
    [setLayout],
  );
  const [showGraphControls, setShowGraphControls] = useState(false);
  const [inspectorCompact, setInspectorCompact] = useState(false);
  const [inspectorActionsOpen, setInspectorActionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteInspectorError, setDeleteInspectorError] = useState<string | null>(null);
  const [agentSetupCopied, setAgentSetupCopied] = useState<'install' | 'convex-ai-files' | null>(
    null,
  );
  const agentSetupCopyTimeoutRef = useRef<number | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const selectedNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
  const selectedField = useGraphSelectionStore((s) => s.state.selectedField);
  const selectedEdge = useGraphSelectionStore((s) => s.state.selectedEdge);
  const highlightedNodeIds = useModelSyncStore((s) => s.highlightedNodeIds);
  const activeTab = useUIChromeStore((s) => s.sidebarTab);
  const setActiveTab = useUIChromeStore((s) => s.setSidebarTab);
  const playgroundScope = useUIChromeStore((s) => s.playgroundScope);
  const setPlaygroundScope = useUIChromeStore((s) => s.setPlaygroundScope);
  const sidebarVisible = useUIChromeStore((s) => s.sidebarVisible);
  const pendingChatMessage = useChatComposerStore((s) => s.pendingChatMessage);
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const filePath = useDocumentStore((s) => s.filePath);
  const convexVersion = useConvexVersionStore();
  const driftedPaths = useDriftStore((s) => s.driftedPaths);
  const graphLayout = useGraphLayoutStore((s) => s.graphLayout);
  const legendVisibility = useMemo(
    () => ({
      showRawTypes: schema.types.some((type) => type.kind === 'raw'),
      showImportedNodes: hasVisibleImportedNodes(schema, graphLayout.showStdlib),
    }),
    [graphLayout.showStdlib, schema],
  );

  // Drive the collapse/expand imperative API from the UI-store flag so
  // the Toolbar's sidebar button toggles the same thing as a user drag
  // to the collapse threshold.
  useEffect(() => {
    if (sidebarVisible) sidebarRef.current?.expand();
    else sidebarRef.current?.collapse();
  }, [sidebarVisible]);

  useEffect(() => {
    if (!selectedEdge) return;
    if (edgeSelectionExists(schema, selectedEdge.data)) return;
    useGraphSelectionStore.getState().selectEdge(null);
  }, [schema, selectedEdge]);

  useEffect(() => {
    function onFieldSelect(event: Event): void {
      const detail = (event as CustomEvent<Partial<FieldSelection>>).detail;
      if (typeof detail?.typeName !== 'string' || typeof detail.fieldName !== 'string') return;
      useGraphSelectionStore
        .getState()
        .selectField({ typeName: detail.typeName, fieldName: detail.fieldName });
    }
    document.addEventListener(TYPE_NODE_EVENT, onFieldSelect);
    return () => document.removeEventListener(TYPE_NODE_EVENT, onFieldSelect);
  }, []);

  useEffect(() => {
    void useConvexVersionStore.getState().refresh(filePath);
  }, [filePath]);

  useEffect(() => {
    function onEdgeSelect(event: Event): void {
      const detail = (event as CustomEvent<EdgeSelection>).detail;
      if (typeof detail?.edgeId !== 'string' || !detail.data) return;
      useGraphSelectionStore.getState().selectEdge(detail);
    }
    document.addEventListener(TYPE_EDGE_SELECT_EVENT, onEdgeSelect);
    return () => document.removeEventListener(TYPE_EDGE_SELECT_EVENT, onEdgeSelect);
  }, []);

  useEffect(() => {
    if (!sidebarVisible || activeTab !== 'playground' || !selectedNodeId) return;
    const selectedType = schema.types.find((type) => type.name === selectedNodeId);
    if (selectedType?.kind !== 'object' || selectedType.table !== true) return;
    usePlaygroundStore.getState().selectType(selectedType.name);
  }, [activeTab, schema, selectedNodeId, sidebarVisible]);

  const createType = useCallback((kind: CreateTypeKind): void => {
    const op = createTypeOp(useUndoStore.getState().schema, kind);
    const result = useUndoStore.getState().apply(op);
    if ('error' in result || op.kind !== 'add_type') return;
    const typeName = op.type.name;
    if (kind === 'enum') useGraphLayoutStore.getState().setGraphLayout({ showEnums: true });
    useGraphSelectionStore.getState().click(typeName, 'replace');
    useGraphSelectionStore.getState().focus(typeName);
    window.setTimeout(() => {
      document.dispatchEvent(new CustomEvent(FOCUS_TYPE_NAME_EVENT, { detail: { typeName } }));
    }, 0);
  }, []);

  const createFieldForSelectedType = useCallback((): void => {
    const typeName = useGraphSelectionStore.getState().state.primaryNodeId;
    if (!typeName) return;
    const op = createFieldOp(useUndoStore.getState().schema, typeName);
    if (!op || op.kind !== 'add_field') return;
    const result = useUndoStore.getState().apply(op);
    if ('error' in result) return;
    useGraphSelectionStore.getState().selectField({ typeName, fieldName: op.field.name });
    useGraphSelectionStore.getState().focus({ nodeId: typeName, fieldName: op.field.name });
  }, []);

  const updateEvolutionPolicy = useCallback((policy: EvolutionPolicy): void => {
    useUndoStore.getState().apply({ kind: 'set_evolution_policy', policy });
  }, []);

  const focusSelectedTypeName = useCallback((): void => {
    const typeName = useGraphSelectionStore.getState().state.primaryNodeId;
    if (!typeName) return;
    useGraphSelectionStore.getState().click(typeName, 'replace');
    window.setTimeout(() => {
      document.dispatchEvent(new CustomEvent(FOCUS_TYPE_NAME_EVENT, { detail: { typeName } }));
    }, 0);
  }, []);

  // Global keyboard shortcuts — forwarded from the document so they
  // work regardless of canvas focus. Inputs / textareas get a pass so
  // we don't intercept typing.
  useEffect(() => {
    function onKey(ev: KeyboardEvent): void {
      const target = ev.target as HTMLElement | null;
      const inInput =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (ev.key === 'Escape') {
        useGraphSelectionStore.getState().clear();
        return;
      }

      if (inInput) return;

      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault();
        if (ev.shiftKey) useUndoStore.getState().redo();
        else useUndoStore.getState().undo();
        return;
      }
      if (mod && (ev.key === 'y' || ev.key === 'Y')) {
        ev.preventDefault();
        useUndoStore.getState().redo();
        return;
      }
      if (mod && ev.shiftKey && (ev.key === 't' || ev.key === 'T')) {
        ev.preventDefault();
        createType('table');
        return;
      }
      if (mod && ev.shiftKey && (ev.key === 'o' || ev.key === 'O')) {
        ev.preventDefault();
        createType('object');
        return;
      }
      if (mod && ev.shiftKey && (ev.key === 'e' || ev.key === 'E')) {
        ev.preventDefault();
        createType('enum');
        return;
      }
      if (mod && ev.shiftKey && (ev.key === 'u' || ev.key === 'U')) {
        ev.preventDefault();
        createType('union');
        return;
      }
      if (mod && ev.shiftKey && (ev.key === 'f' || ev.key === 'F')) {
        ev.preventDefault();
        createFieldForSelectedType();
        return;
      }

      if (ev.key === 'F2') {
        ev.preventDefault();
        focusSelectedTypeName();
        return;
      }

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        const selected = useGraphSelectionStore.getState().state.primaryNodeId;
        if (!selected) return;
        ev.preventDefault();
        if (selectedField?.typeName === selected) {
          const result = useUndoStore.getState().apply({
            kind: 'remove_field',
            typeName: selectedField.typeName,
            fieldName: selectedField.fieldName,
          });
          if ('schema' in result) useGraphSelectionStore.getState().selectField(null);
          return;
        }
        const result = useUndoStore.getState().apply({ kind: 'delete_type', name: selected });
        if ('schema' in result) {
          useGraphSelectionStore.getState().clearNodes();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [createFieldForSelectedType, createType, focusSelectedTypeName, selectedField]);

  const schemaAgentApi = useMemo(
    () =>
      typeof window !== 'undefined' && window.contexture?.schemaAgent
        ? window.contexture.schemaAgent
        : noopSchemaAgentApi(),
    [],
  );
  const chat = useSchemaAgentChat({ api: schemaAgentApi });

  useDrift();
  useModelSync();
  useModelChangeLogRecorder();

  const fileMenu = useFileMenu({
    getChat: chat.toHistory,
    onBundleLoaded: ({ chat: loadedChat }) => {
      chat.hydrateHistory(loadedChat);
    },
    onNew: () => {
      chat.hydrateHistory({ version: '1', messages: [] });
    },
  });

  useEffect(
    () => () => {
      if (agentSetupCopyTimeoutRef.current !== null) {
        window.clearTimeout(agentSetupCopyTimeoutRef.current);
      }
    },
    [],
  );

  const copyAgentSetupText = useCallback((key: 'install' | 'convex-ai-files', text: string) => {
    copyToClipboard(text);
    setAgentSetupCopied(key);
    if (agentSetupCopyTimeoutRef.current !== null) {
      window.clearTimeout(agentSetupCopyTimeoutRef.current);
    }
    agentSetupCopyTimeoutRef.current = window.setTimeout(() => {
      setAgentSetupCopied(null);
      agentSetupCopyTimeoutRef.current = null;
    }, 2000);
  }, []);

  useProjectAutoSave({
    getChat: chat.toHistory,
  });

  useSessionPersistence({
    layout,
    onRestoreSession: () => undefined,
  });

  const startNewModel = useCallback((): void => {
    fileMenu.handleNew();
    useUIChromeStore.getState().setSidebarVisible(true);
  }, [fileMenu]);

  const openExistingModel = useCallback((): void => {
    void fileMenu.handleOpen();
  }, [fileMenu]);

  const loadSample = useCallback(() => {
    fileMenu.handleNew();
    useUndoStore
      .getState()
      .apply({ kind: 'replace_schema', schema: allotment as unknown as never }, { log: false });
    useDocumentStore.getState().markDirty();
    useUIChromeStore.getState().setSidebarVisible(true);
    useUIChromeStore.getState().setSidebarTab('schema');
  }, [fileMenu]);

  // Pull the recent-files list when the empty state might need it and
  // again whenever the file-path changes (a successful open/save
  // bumps the list).
  useEffect(() => {
    const api = window.contexture?.file;
    if (!api) return;
    let cancelled = false;
    api
      .getRecentFiles()
      .then((list) => {
        if (!cancelled) setRecentFiles(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const detailTypeName = selectedField?.typeName ?? selectedEdge?.data.sourceType ?? selectedNodeId;
  const detailType =
    typeof detailTypeName === 'string'
      ? schema.types.find((type) => type.name === detailTypeName)
      : undefined;
  const inspectorKind = detailType ? typeKindLabel(detailType) : selectedEdge ? 'ref' : null;
  const inspectorTitle =
    selectedField && selectedField.typeName === detailTypeName
      ? selectedField.fieldName
      : selectedEdge
        ? edgeSelectionLabel(selectedEdge)
        : detailTypeName;
  const inspectorSelectionKind =
    selectedField && selectedField.typeName === detailTypeName
      ? 'field'
      : selectedEdge
        ? 'edge'
        : inspectorKind;
  const inspectorDeleteLabel = selectedField
    ? `field ${selectedField.fieldName}`
    : detailTypeName
      ? `type ${detailTypeName}`
      : 'selection';
  const canDeleteInspectorSelection = detailType !== undefined && selectedEdge === null;
  const inspectorLinkedToChat = activeTab === 'chat' && pendingChatMessage !== null;
  const backToSelectedType = useCallback((): void => {
    if (!selectedField) return;
    useGraphSelectionStore.getState().selectField(null);
    useGraphSelectionStore.getState().focus(selectedField.typeName);
  }, [selectedField]);
  const deleteInspectorSelection = useCallback((): string | null => {
    if (selectedField) {
      const result = useUndoStore.getState().apply({
        kind: 'remove_field',
        typeName: selectedField.typeName,
        fieldName: selectedField.fieldName,
      });
      if ('error' in result) return result.error;
      useGraphSelectionStore.getState().selectField(null);
      return null;
    }
    if (!detailTypeName || !detailType) return 'Nothing is selected to delete.';
    const result = useUndoStore.getState().apply({ kind: 'delete_type', name: detailTypeName });
    if ('error' in result) return result.error;
    useGraphSelectionStore.getState().clear();
    return null;
  }, [detailType, detailTypeName, selectedField]);
  const openSelectedTypeInPlayground = useCallback((): void => {
    if (!detailTypeName) return;
    setPlaygroundScope({ mode: 'selected', typeName: detailTypeName });
    useUIChromeStore.getState().setSidebarVisible(true);
    setActiveTab('playground');
  }, [detailTypeName, setActiveTab, setPlaygroundScope]);
  const selectPlaygroundEntity = useCallback((typeName: string): void => {
    useGraphSelectionStore.getState().click(typeName, 'replace');
    useGraphSelectionStore.getState().focus(typeName);
  }, []);
  const selectActivityTab = useCallback(
    (tab: typeof activeTab): void => {
      if (tab === 'playground') setPlaygroundScope({ mode: 'all' });
      setActiveTab(tab);
    },
    [setActiveTab, setPlaygroundScope],
  );
  const selectedStdlibTypeName =
    typeof selectedNodeId === 'string' && STDLIB_TYPE_DEFINITIONS.has(selectedNodeId)
      ? selectedNodeId
      : undefined;
  const playgroundHighlightedTypeName =
    playgroundScope.mode === 'selected' && detailTypeName === playgroundScope.typeName
      ? playgroundScope.typeName
      : null;
  const hasSelection = detailTypeName !== null && detailTypeName !== undefined;
  const onboardingState = useMemo(
    () =>
      buildOnboardingState(
        schema,
        activeTab,
        filePath,
        isDirty,
        driftedPaths.length,
        convexVersion.status,
        convexVersion.convexAiFiles.status,
        convexVersion.contextureMcp.status,
      ),
    [
      activeTab,
      convexVersion.contextureMcp.status,
      convexVersion.convexAiFiles.status,
      convexVersion.status,
      driftedPaths.length,
      filePath,
      isDirty,
      schema,
    ],
  );

  // Emit generated sources for the SchemaPanel. Only runs while the
  // Schema tab is active so we don't burn cycles on every IR change
  // when the user is looking at Chat / Properties. Wrapped in try/catch
  // so a malformed intermediate state (e.g. during a multi-op chat
  // turn) surfaces as an in-panel error rather than crashing the sidebar.
  const schemaEmissions = useMemo((): {
    sources: SchemaPanelSource[];
    error: string | null;
  } => {
    if (activeTab !== 'schema') {
      return {
        sources: [],
        error: null,
      };
    }
    const irPath = filePath ?? 'schema.contexture.json';
    const sources: SchemaPanelSource[] = [];
    let error: string | null = null;

    for (const target of previewableGeneratedTargets()) {
      const enabled = isGeneratedTargetEnabled(schema, target.kind);
      if (!enabled) {
        sources.push({ type: target.kind, enabled: false, source: '' });
        continue;
      }
      try {
        sources.push({
          type: target.kind,
          enabled: true,
          source: emitGeneratedTarget(
            schema,
            target.kind,
            irPath,
            {},
            {
              stdlibNamespaces: STDLIB_REGISTRY.namespaces,
            },
          ),
        });
      } catch (e) {
        if (target.kind === 'zod') {
          error = e instanceof Error ? e.message : String(e);
          return { sources, error };
        }
        // Non-fatal: failed secondary output stays hidden.
      }
    }

    return { sources, error };
  }, [activeTab, schema, filePath]);

  const enableSchemaOutput = useCallback(
    (type: SchemaPanelSource['type']): void => {
      useUndoStore.getState().apply({
        kind: 'replace_schema',
        schema: enableGeneratedTarget(schema, type),
      });
    },
    [schema],
  );

  const updateSchemaOutputDir = useCallback(
    (type: SchemaOutputType, dir: string | null): void => {
      if (type === 'stdlib-runtime') {
        const nextConfig = { ...(schema.outputs?.stdlibRuntime ?? {}) };
        if (dir === null) delete nextConfig.dir;
        else nextConfig.dir = dir;
        useUndoStore.getState().apply({
          kind: 'replace_schema',
          schema: {
            ...schema,
            outputs: {
              ...(schema.outputs ?? {}),
              stdlibRuntime: nextConfig,
            },
          },
        });
        return;
      }
      useUndoStore.getState().apply({
        kind: 'replace_schema',
        schema: setGeneratedTargetOutputDir(schema, type, dir),
      });
    },
    [schema],
  );

  const openGeneratedFile = useCallback((path: string): void => {
    void window.contexture?.shell.openInEditor(path);
  }, []);

  // Filename shown in the SchemaPanel header: the document's basename
  // with the IR suffix swapped for `.schema.ts`. Falls back to a
  // generic label before the document is saved.
  const schemaFileName = useMemo(() => {
    if (filePath === null) return 'schema.schema.ts';
    const base = filePath.split(/[\\/]/).pop() ?? filePath;
    return base.replace(/\.contexture\.json$/i, '.schema.ts');
  }, [filePath]);

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground">
      <UpdateBanner />
      <Toolbar onCreateType={createType} />

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 overflow-hidden"
        id="main-layout"
      >
        <ResizablePanel id="graph-panel" defaultSize="70%" minSize="30%">
          <div className="flex flex-col w-full h-full">
            <DriftBanner />
            <ModelSyncBanner />
            <div className="relative flex-1 min-h-0">
              {hasSchema && (
                <div className="absolute top-2 left-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-start gap-2">
                  <EvolutionPolicyPanel policy={evolutionPolicy} onChange={updateEvolutionPolicy} />
                  <GraphLegend
                    showEnumNodes={graphLayout.showEnums}
                    showStdlibNodes={graphLayout.showStdlib}
                    showRawTypes={legendVisibility.showRawTypes}
                    showImportedNodes={legendVisibility.showImportedNodes}
                  />
                  <section
                    aria-label="Graph controls"
                    className="overflow-hidden rounded-xl border border-border/80 bg-card/95 text-xs text-card-foreground shadow-sm backdrop-blur"
                  >
                    <button
                      type="button"
                      className="flex h-[38px] w-full min-w-40 items-center justify-between gap-3 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-expanded={showGraphControls}
                      aria-label={
                        showGraphControls ? 'Collapse graph controls' : 'Expand graph controls'
                      }
                      title="Graph controls"
                      onClick={() => setShowGraphControls((open) => !open)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <SlidersHorizontal className="size-4" aria-hidden="true" />
                        <span>Graph Controls</span>
                      </span>
                      {showGraphControls ? (
                        <ChevronUp className="size-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                      )}
                    </button>
                    {showGraphControls && (
                      <div className="w-72 border-t border-border/70">
                        <GraphControlsPanel />
                      </div>
                    )}
                  </section>
                </div>
              )}
              {hasSchema ? (
                <>
                  <GraphCanvas
                    positions={positions}
                    onPositionsChange={setPositions}
                    highlightedNodeIds={highlightedNodeIds}
                  />
                  <aside
                    aria-label="Properties inspector"
                    className={`absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-[0_12px_28px_rgba(0,0,0,0.18)] backdrop-blur transition-[width,max-height,box-shadow] duration-150 ease-out ${
                      inspectorCompact
                        ? 'w-[min(18rem,calc(100%-1.5rem))]'
                        : 'w-[min(24rem,calc(100%-1.5rem))]'
                    }`}
                  >
                    <div className="px-3 py-2.5">
                      {inspectorCompact ? (
                        <div className="grid min-h-8 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <div className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {inspectorTitle ?? 'Inspector'}
                          </div>
                          <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            aria-label="Expand inspector"
                            title="Expand inspector"
                            onClick={() => setInspectorCompact(false)}
                          >
                            <Maximize2 className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <div className="grid min-h-[4.25rem] grid-rows-[auto_auto] gap-1.5">
                          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                              {selectedField && selectedField.typeName === detailTypeName ? (
                                <>
                                  <span className="truncate">Canvas</span>
                                  <span aria-hidden="true" className="text-border">
                                    /
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="-ml-1 h-5 max-w-32 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={backToSelectedType}
                                    aria-label={`Back to ${selectedField.typeName} fields`}
                                  >
                                    <span className="truncate">{selectedField.typeName}</span>
                                  </Button>
                                  <span aria-hidden="true" className="text-border">
                                    /
                                  </span>
                                  <span className="truncate">{selectedField.fieldName}</span>
                                </>
                              ) : (
                                <>
                                  <span className="truncate">Canvas</span>
                                  {detailTypeName && (
                                    <>
                                      <span aria-hidden="true" className="text-border">
                                        /
                                      </span>
                                      <span className="truncate">{detailTypeName}</span>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                            <button
                              type="button"
                              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              aria-label="Collapse inspector"
                              title="Collapse inspector"
                              onClick={() => setInspectorCompact(true)}
                            >
                              <Minimize2 className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <div className="min-w-0 truncate text-sm font-semibold text-foreground">
                                {inspectorTitle ?? 'Inspector'}
                              </div>
                              <div className="shrink-0">
                                {inspectorSelectionKind === 'field' && (
                                  <span
                                    className="w-fit rounded border border-border bg-muted/40 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                                    data-testid="inspector-selection-badge"
                                  >
                                    field
                                  </span>
                                )}
                                {inspectorSelectionKind &&
                                  inspectorSelectionKind !== 'field' &&
                                  inspectorSelectionKind !== 'edge' &&
                                  inspectorSelectionKind !== 'ref' && (
                                    <TypeKindBadge kind={inspectorSelectionKind} />
                                  )}
                                {(inspectorSelectionKind === 'edge' ||
                                  inspectorSelectionKind === 'ref') && (
                                  <span className="w-fit rounded border border-reference/35 bg-reference/10 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-reference-text">
                                    edge
                                  </span>
                                )}
                              </div>
                              {inspectorLinkedToChat && (
                                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-reference/25 bg-reference/10 px-2 text-[10px] font-medium text-reference-text">
                                  <MessageSquare className="size-3" aria-hidden="true" />
                                  Linked
                                </span>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {detailTypeName && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={openSelectedTypeInPlayground}
                                >
                                  <Play aria-hidden="true" className="size-3.5" />
                                  Try
                                </Button>
                              )}
                              {canDeleteInspectorSelection && (
                                <DropdownMenu
                                  open={inspectorActionsOpen}
                                  onOpenChange={setInspectorActionsOpen}
                                >
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground"
                                      aria-label="Open selection actions"
                                      onClick={() => setInspectorActionsOpen(true)}
                                    >
                                      <MoreHorizontal aria-hidden="true" className="size-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={(event) => {
                                        event.preventDefault();
                                        setInspectorActionsOpen(false);
                                        setDeleteInspectorError(null);
                                        setDeleteDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 aria-hidden="true" className="size-4" />
                                      Delete...
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <AlertDialog
                      open={deleteDialogOpen}
                      onOpenChange={(open) => {
                        setDeleteDialogOpen(open);
                        if (!open) setDeleteInspectorError(null);
                      }}
                    >
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                            <Trash2 aria-hidden="true" />
                          </AlertDialogMedia>
                          <AlertDialogTitle>Delete {inspectorDeleteLabel}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the selected {selectedField ? 'field' : 'type'} from
                            the model. You can undo this action afterwards.
                          </AlertDialogDescription>
                          {deleteInspectorError && (
                            <Alert variant="destructive" className="mt-1 text-left">
                              <AlertCircle aria-hidden="true" />
                              <AlertTitle>Delete blocked</AlertTitle>
                              <AlertDescription>{deleteInspectorError}</AlertDescription>
                            </Alert>
                          )}
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setDeleteInspectorError(null)}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={(event) => {
                              const error = deleteInspectorSelection();
                              if (error) {
                                event.preventDefault();
                                setDeleteInspectorError(error);
                              } else {
                                setDeleteInspectorError(null);
                              }
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    {!inspectorCompact && (
                      <div className="min-h-0 flex-1 overflow-y-auto">
                        {hasSelection ? (
                          <DetailPanel
                            selection={{
                              edge: selectedEdge?.data,
                              typeName: detailTypeName ?? undefined,
                              fieldName:
                                selectedField && selectedField.typeName === detailTypeName
                                  ? selectedField.fieldName
                                  : undefined,
                            }}
                            onClearSelection={() => {
                              useGraphSelectionStore.getState().selectField(null);
                              useGraphSelectionStore.getState().selectEdge(null);
                            }}
                            onClearSelectedField={() =>
                              useGraphSelectionStore.getState().selectField(null)
                            }
                            onSelectField={(typeName, fieldName) => {
                              useGraphSelectionStore
                                .getState()
                                .selectField({ typeName, fieldName });
                            }}
                          />
                        ) : (
                          <Empty className="border-0 p-4">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <MousePointer2 />
                              </EmptyMedia>
                              <EmptyTitle className="text-sm font-medium">No selection</EmptyTitle>
                              <EmptyDescription className="text-xs">
                                Select a type on the canvas to view and edit its properties.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                      </div>
                    )}
                  </aside>
                </>
              ) : (
                <EmptyState
                  onNewModel={startNewModel}
                  onOpenModel={openExistingModel}
                  onLoadSample={loadSample}
                  recentFiles={recentFiles}
                  onOpenRecent={fileMenu.handleOpenPath}
                  isBundle={filePath !== null}
                  projectName={filePath?.split('/').at(-1)?.replace('.contexture.json', '') ?? null}
                  providerLabel={chat.providerLabel}
                />
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel
          id="sidebar-panel"
          defaultSize="30%"
          minSize="25%"
          maxSize="60%"
          collapsible
          collapsedSize={0}
          panelRef={sidebarRef}
        >
          <div className="flex h-full bg-background">
            <div className="flex min-w-0 flex-1 overflow-hidden border-l border-border/70 bg-background">
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className={activeTab !== 'chat' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                  <ChatPanel chat={chat} />
                </div>
                <div className={activeTab !== 'review' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                  <ReviewPanel schema={schema} />
                </div>
                <div className={activeTab !== 'schema' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                  {hasSchema && (
                    <OnboardingLoopPanel
                      state={onboardingState}
                      convexVersion={convexVersion}
                      agentSetupCopied={agentSetupCopied}
                      onCopyAgentSetup={copyAgentSetupText}
                    />
                  )}
                  <SchemaPanel
                    sources={schemaEmissions.sources}
                    isEmpty={!hasSchema}
                    error={schemaEmissions.error}
                    onCopy={copyToClipboard}
                    onEnableOutput={enableSchemaOutput}
                    onOutputDirChange={updateSchemaOutputDir}
                    documentFilePath={filePath}
                    onOpenGeneratedFile={openGeneratedFile}
                    schemaFileName={schemaFileName}
                    schema={schema}
                    convexVersion={convexVersion}
                    showAgentSetup={!hasSchema}
                  />
                </div>
                <div
                  className={activeTab !== 'playground' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}
                >
                  <PlaygroundPanel
                    schema={schema}
                    highlightedTypeName={playgroundHighlightedTypeName}
                    onSelectEntity={selectPlaygroundEntity}
                  />
                </div>
                <div className={activeTab !== 'stdlib' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                  <StdlibPanel schema={schema} focusedTypeName={selectedStdlibTypeName} />
                </div>
                <div
                  className={activeTab !== 'changes' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}
                >
                  <ChangesPanel />
                </div>
              </div>
            </div>
            <ActivityBar activeTab={activeTab} onTabChange={selectActivityTab} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar />
      <DocumentDialogs onForceSave={fileMenu.handleForceSave} />
      <ReconcileModal />
    </div>
  );
}

function typeKindLabel(type: TypeDef): TypeKindLabel {
  if (type.kind === 'object') return type.table ? 'table' : 'object';
  if (type.kind === 'enum') return 'enum';
  if (type.kind === 'discriminatedUnion') return 'union';
  return 'raw';
}

function hasVisibleImportedNodes(schema: Schema, showStdlibNodes: boolean): boolean {
  const localNames = new Set(schema.types.map((type) => type.name));
  return schema.types.some((type) => {
    if (type.kind === 'discriminatedUnion') {
      return type.variants.some((variant) =>
        isVisibleImportedTarget(variant, localNames, showStdlibNodes),
      );
    }
    if (type.kind !== 'object') return false;
    return type.fields.some((field) => {
      const target = unwrapRefTarget(field.type);
      return target ? isVisibleImportedTarget(target, localNames, showStdlibNodes) : false;
    });
  });
}

function isVisibleImportedTarget(
  typeName: string,
  localNames: ReadonlySet<string>,
  showStdlibNodes: boolean,
): boolean {
  const crossBoundary = typeName.includes('.') || !localNames.has(typeName);
  if (!crossBoundary) return false;
  return showStdlibNodes || !isStdlibRef(typeName);
}

function unwrapRefTarget(type: FieldType): string | undefined {
  let current = type;
  while (current.kind === 'array') current = current.element;
  return current.kind === 'ref' ? current.typeName : undefined;
}

function isStdlibRef(typeName: string): boolean {
  const [namespace, name, ...rest] = typeName.split('.');
  return (
    rest.length === 0 &&
    namespace !== undefined &&
    name !== undefined &&
    STDLIB_REGISTRY.hasType(namespace, name)
  );
}

function edgeSelectionLabel(edge: EdgeSelection): string {
  if (edge.data.sourceField) return edge.data.sourceField;
  if (edge.data.relation === 'unionVariant') return edge.data.targetType;
  return `${edge.data.sourceType} edge`;
}

function edgeSelectionExists(schema: Schema, edge: EdgeSelection['data']): boolean {
  const sourceType = schema.types.find((type) => type.name === edge.sourceType);
  if (!sourceType) return false;

  if (edge.relation === 'unionVariant') {
    return (
      sourceType.kind === 'discriminatedUnion' && sourceType.variants.includes(edge.targetType)
    );
  }

  if (sourceType.kind !== 'object' || typeof edge.sourceField !== 'string') return false;
  return sourceType.fields.some((field) => field.name === edge.sourceField);
}

function EmptyState({
  onNewModel,
  onOpenModel,
  onLoadSample,
  recentFiles,
  onOpenRecent,
  isBundle = false,
  projectName = null,
  providerLabel,
}: {
  onNewModel: () => void;
  onOpenModel: () => void;
  onLoadSample: () => void;
  recentFiles: string[];
  onOpenRecent: (path: string) => void;
  isBundle?: boolean;
  projectName?: string | null;
  providerLabel: 'Codex' | 'Claude';
}): React.JSX.Element {
  return (
    <div
      className="relative w-full h-full flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--graph-bg)' }}
    >
      <GraphBackground />
      {isBundle ? (
        <div className="relative z-10 text-center text-muted-foreground max-w-sm space-y-3">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {projectName ?? 'Contexture bundle'}
          </h1>
          <p className="text-sm">
            This bundle is ready for generated Convex schema and validators. Start chatting with{' '}
            {providerLabel} or add types directly.
          </p>
          <p className="text-xs text-muted-foreground/60">
            You can iterate on the schema by continuing the conversation, or edit types directly
            once they appear on the canvas.
          </p>
        </div>
      ) : (
        <div className="relative z-10 grid max-h-[calc(100%-2rem)] w-full max-w-5xl grid-cols-[minmax(0,1fr)_18rem] gap-4 overflow-y-auto px-6 py-2 text-muted-foreground max-lg:max-w-2xl max-lg:grid-cols-1">
          <section className="relative overflow-hidden rounded-md border border-border/60 bg-card/75 p-4 shadow-sm backdrop-blur-md">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                  Contexture
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start a Convex model, inspect generated files, and keep drift visible.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['IR source', 'Generated schema', 'Drift checks', 'Agent ops'].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <FileCode2 className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <StartAction
                icon={<FilePlus2 />}
                title="Create new Convex model"
                description="Begin with an empty .contexture.json source of truth."
                onClick={onNewModel}
                testId="start-new-model"
                emphasis
              />
              <StartAction
                icon={<FolderOpen />}
                title="Open existing model"
                description="Load a saved .contexture.json bundle from disk."
                onClick={onOpenModel}
                testId="start-open-model"
              />
              <StartAction
                icon={<Boxes />}
                title="Inspect sample Convex model"
                description="Open a small app with tables, refs, enums, indexes, and outputs."
                onClick={onLoadSample}
                testId="start-load-sample"
              />
              <StartAction
                icon={<Bot />}
                title={`Work with ${providerLabel}`}
                description="Agent changes are proposed as Contexture ops for review."
                onClick={() => {
                  useUIChromeStore.getState().setSidebarVisible(true);
                  useUIChromeStore.getState().setSidebarTab('chat');
                }}
                testId="start-open-agent"
              />
            </div>

            <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <LoopStep label="1" text="Model tables, fields, refs, and indexes in the IR." />
              <LoopStep label="2" text="Generate Convex schema and validators from the IR." />
              <LoopStep label="3" text="Review drift and supervised agent ops before shipping." />
            </div>
          </section>

          <section className="rounded-md border border-border/60 bg-card/75 p-3 shadow-sm backdrop-blur-md">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Clock className="size-3.5" />
              <span>Recent models</span>
            </div>
            {recentFiles.length > 0 ? (
              <div className="space-y-1">
                {recentFiles.slice(0, 6).map((fp) => (
                  <button
                    type="button"
                    key={fp}
                    onClick={() => onOpenRecent(fp)}
                    className="w-full cursor-pointer rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={fp}
                  >
                    <span className="block truncate font-medium text-foreground">
                      {fp.split('/').pop()}
                    </span>
                    <span className="block truncate text-muted-foreground/70">
                      {fp.split('/').slice(0, -1).join('/')}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed border-border/80 p-2 text-xs leading-snug">
                Saved Contexture models appear here after you open or save them.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

interface OnboardingState {
  hasTable: boolean;
  hasField: boolean;
  hasRef: boolean;
  hasIndex: boolean;
  outputsVisible: boolean;
  hasSavedOutputs: boolean;
  driftClean: boolean;
  convexVersionChecked: boolean;
  convexVersionReady: boolean;
  convexAiFilesReady: boolean;
  contextureMcpReady: boolean;
}

function buildOnboardingState(
  schema: Schema,
  activeTab: string,
  filePath: string | null,
  isDirty: boolean,
  driftedCount: number,
  convexVersionStatus: 'idle' | 'loading' | 'ok' | 'mismatch' | 'target_missing' | 'probe_failed',
  convexAiFilesStatus: 'idle' | 'loading' | 'ready' | 'not_ready' | 'probe_failed',
  contextureMcpStatus: 'idle' | 'loading' | 'ready' | 'not_ready' | 'probe_failed',
): OnboardingState {
  const objects = schema.types.filter((type) => type.kind === 'object');
  return {
    hasTable: objects.some((type) => type.table === true),
    hasField: objects.some((type) => type.fields.length > 0),
    hasRef: objects.some((type) => type.fields.some((field) => field.type.kind === 'ref')),
    hasIndex: objects.some(
      (type) => (type.indexes ?? []).length > 0 || (type.searchIndexes ?? []).length > 0,
    ),
    outputsVisible: activeTab === 'schema',
    hasSavedOutputs: filePath !== null && !isDirty,
    driftClean: filePath !== null && driftedCount === 0,
    convexVersionChecked: convexVersionStatus !== 'idle' && convexVersionStatus !== 'loading',
    convexVersionReady: convexVersionStatus === 'ok',
    convexAiFilesReady: convexAiFilesStatus === 'ready',
    contextureMcpReady: contextureMcpStatus === 'ready',
  };
}

function OnboardingLoopPanel({
  state,
  convexVersion,
  agentSetupCopied,
  onCopyAgentSetup,
}: {
  state: OnboardingState;
  convexVersion: SchemaPanelProps['convexVersion'];
  agentSetupCopied: 'install' | 'convex-ai-files' | null;
  onCopyAgentSetup: (key: 'install' | 'convex-ai-files', text: string) => void;
}): React.JSX.Element {
  interface ReadinessDetail {
    label: string;
    done: boolean;
    help: string;
  }
  const groups: {
    label: string;
    done: boolean;
    note?: string;
    detail: ReadinessDetail[];
  }[] = [
    {
      label: 'Model',
      done: state.hasTable && state.hasField && state.hasRef && state.hasIndex,
      detail: [
        {
          label: 'Table',
          done: state.hasTable,
          help: 'Mark at least one object type as a Convex table.',
        },
        {
          label: 'Fields',
          done: state.hasField,
          help: 'Add at least one field to an object type.',
        },
        {
          label: 'Ref',
          done: state.hasRef,
          help: 'Add a ref field that points at another model type.',
        },
        {
          label: 'Index',
          done: state.hasIndex,
          help: 'Add an index or search index to a table.',
        },
      ],
    },
    {
      label: 'Generated',
      done: state.outputsVisible && state.hasSavedOutputs && state.driftClean,
      detail: [
        {
          label: 'Files visible',
          done: state.outputsVisible,
          help: 'Open the generated output preview in this panel.',
        },
        {
          label: 'Saved',
          done: state.hasSavedOutputs,
          help: 'Save and emit this model so generated files are written to disk.',
        },
        {
          label: 'Drift clean',
          done: state.driftClean,
          help: 'Resolve generated-file drift, then emit or check drift again.',
        },
      ],
    },
    {
      label: 'Convex',
      done: state.convexVersionChecked && state.convexVersionReady,
      detail: [
        {
          label: 'Package checked',
          done: state.convexVersionChecked,
          help: 'Open a saved project so Contexture can inspect the target app package.',
        },
        {
          label: 'Version match',
          done: state.convexVersionReady,
          help: 'Install or update Convex so the target app matches the Contexture emitter version.',
        },
      ],
    },
    {
      label: 'Agent',
      done: state.convexAiFilesReady && state.contextureMcpReady,
      detail: [
        {
          label: 'Convex AI files',
          done: state.convexAiFilesReady,
          help: 'Run bunx convex ai-files install in the target repo.',
        },
        {
          label: 'Contexture MCP',
          done: state.contextureMcpReady,
          help: 'Connect Contexture MCP to your agent client, then start a fresh agent session.',
        },
      ],
    },
  ];

  return (
    <aside
      className="border-b border-border bg-background px-3 py-2.5 text-xs"
      aria-label="Project readiness"
      data-testid="onboarding-loop"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Project readiness</h2>
          <p className="mt-0.5 text-muted-foreground">
            The IR is the source; generated files can be replaced any time.
          </p>
        </div>
        <GitCompareArrows className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      <ul className="mt-2 grid grid-cols-2 gap-1.5 min-[720px]:grid-cols-4">
        {groups.map((group) => {
          const completeCount = group.detail.filter((detail) => detail.done).length;
          const detailText = group.detail
            .map((detail) => `${detail.label}: ${detail.done ? 'ready' : 'needs action'}`)
            .join(', ');
          return (
            <li key={group.label}>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="grid min-h-11 w-full grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-0.5 rounded border border-border/70 bg-card/60 px-2 py-1.5 text-left transition-colors hover:border-reference/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                    aria-label={`${group.label}: ${detailText}. Open readiness details.`}
                  >
                    {group.done ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <span
                        className="size-3.5 shrink-0 rounded-full border border-warning/70 bg-warning/10"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`truncate ${group.done ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {group.label}
                    </span>
                    <span className="col-start-2 text-[10px] leading-none text-muted-foreground/80">
                      {completeCount}/{group.detail.length}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className={group.label === 'Agent' ? 'w-[430px] p-2' : 'w-80 p-2'}
                  align="start"
                >
                  {group.label === 'Agent' ? (
                    <AgentSetupContent
                      convexVersion={convexVersion}
                      copied={agentSetupCopied}
                      onCopy={onCopyAgentSetup}
                    />
                  ) : (
                    <>
                      <div className="px-1 pb-1">
                        <h3 className="text-xs font-semibold text-foreground">
                          {group.label} readiness
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                          {completeCount}/{group.detail.length} checks ready.
                        </p>
                      </div>
                      <ul className="space-y-1">
                        {group.detail.map((detail) => (
                          <li
                            key={detail.label}
                            className="rounded border border-border/60 bg-background/70 px-2 py-1.5"
                          >
                            <div className="flex items-center gap-1.5">
                              {detail.done ? (
                                <CheckCircle2
                                  className="size-3.5 shrink-0 text-success"
                                  aria-hidden="true"
                                />
                              ) : (
                                <span
                                  className="size-3.5 shrink-0 rounded-full border border-warning/70 bg-warning/10"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="text-[11px] font-medium text-foreground">
                                {detail.label}
                              </span>
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {detail.done ? 'Ready' : 'Needs action'}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                              {detail.help}
                            </p>
                          </li>
                        ))}
                      </ul>
                      {group.note ? (
                        <p className="mt-2 rounded border border-warning/30 bg-warning/10 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
                          {group.note}
                        </p>
                      ) : null}
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function StartAction({
  icon,
  title,
  description,
  onClick,
  testId,
  emphasis = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  testId: string;
  emphasis?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        emphasis
          ? 'border-primary/45 bg-primary/10 hover:border-primary/75 hover:bg-primary/20'
          : 'border-border bg-background/70 hover:border-primary/45 hover:bg-primary/10'
      }`}
      data-testid={testId}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-md [&>svg]:size-4 ${
          emphasis ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
        }`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function LoopStep({ label, text }: { label: string; text: string }): React.JSX.Element {
  return (
    <div className="flex items-start gap-2 rounded border border-border/70 bg-background/70 p-2">
      <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border text-[10px] font-semibold text-foreground">
        {label}
      </span>
      <span className="leading-snug">{text}</span>
    </div>
  );
}

function copyToClipboard(text: string): void {
  if (typeof navigator === 'undefined') return;
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function noopSchemaAgentApi() {
  const unsub = () => undefined;
  return {
    send: async () => ({ ok: false, error: 'schema agent unavailable (no preload bridge)' }),
    setIR: () => undefined,
    abort: async () => ({ ok: false, error: 'schema agent unavailable' }),
    getStatus: async () => ({ provider: 'codex', readiness: 'app_server_unavailable' }),
    listModels: async () => [],
    setProvider: async () => ({ ok: false, error: 'schema agent unavailable' }),
    setModelOptions: async () => ({ ok: false }),
    startLogin: async () => ({ id: '', mode: 'chatgpt' as const }),
    cancelLogin: async () => undefined,
    logout: async () => undefined,
    threadSet: async () => ({ ok: false }),
    threadClear: async () => ({ ok: false }),
    replyTool: () => undefined,
    onAssistantDelta: () => unsub,
    onAssistantFinal: () => unsub,
    onToolCallStarted: () => unsub,
    onToolCallFinished: () => unsub,
    onError: () => unsub,
    onStatusChanged: () => unsub,
    onThreadUpdated: () => unsub,
    onThreadDesynced: () => unsub,
    onToolRequest: () => unsub,
    onTurnBegin: () => unsub,
    onTurnCommit: () => unsub,
    onTurnRollback: () => unsub,
  };
}
