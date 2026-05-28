/**
 * Contexture app shell.
 *
 * Primary desktop layout:
 *
 *   ┌───────────────────────── Toolbar ─────────────────────────┐
 *   ├──────────────────────────────────────────┬────────────────┤
 *   │                                          │ SidePanel      │
 *   │             GraphCanvas                  │  (Detail /     │
 *   │                                          │   Chat /       │
 *   │                                          │   Schema)      │
 *   │                                          │  + ActivityBar │
 *   ├──────────────────────────── StatusBar ───┴────────────────┤
 *   └───────────────────────────────────────────────────────────┘
 *
 * Canvas and side panel sit inside a `ResizablePanelGroup` so the
 * split is drag-adjustable and the side panel can collapse when
 * `useUIChromeStore.sidebarVisible` is false (toggled by the Toolbar's
 * sidebar button).
 */

import {
  emitGeneratedTarget,
  enableGeneratedTarget,
  isGeneratedTargetEnabled,
  previewableGeneratedTargets,
} from '@contexture/core/generated-targets';
import type { Schema } from '@contexture/core/ir';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { ChevronDown, Clock, MousePointer2, SlidersHorizontal } from 'lucide-react';
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
import { type EdgeSelection, TYPE_EDGE_SELECT_EVENT } from './components/graph/edge-select-event';
import { GraphBackground } from './components/graph/GraphBackground';
import { type CanvasPosition, GraphCanvas } from './components/graph/GraphCanvas';
import { type CreateTypeKind, createFieldOp, createTypeOp } from './components/graph/interactions';
import { type FieldSelection, TYPE_NODE_EVENT } from './components/graph/nodes/TypeNode';
import { DriftBanner } from './components/hud/DriftBanner';
import { ModelSyncBanner } from './components/hud/ModelSyncBanner';
import { SchemaPanel, type SchemaPanelSource } from './components/schema/SchemaPanel';
import { StatusBar } from './components/status-bar/StatusBar';
import { GraphControlsPanel } from './components/toolbar/GraphControlsPanel';
import { Toolbar } from './components/toolbar/Toolbar';
import { UpdateBanner } from './components/UpdateBanner';
import { Button } from './components/ui/button';
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
import { useDocumentStore } from './store/document';
import { useGraphLayoutStore } from './store/layout-config';
import { useModelSyncStore } from './store/model-sync';
import { useGraphSelectionStore } from './store/selection';
import { useUIChromeStore } from './store/ui-chrome';
import { useUndoStore } from './store/undo';

export default function App(): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
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
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const selectedNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
  const selectedEdgeId = useGraphSelectionStore((s) => s.state.edgeId);
  const [selectedField, setSelectedField] = useState<FieldSelection | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EdgeSelection | null>(null);
  const highlightedNodeIds = useModelSyncStore((s) => s.highlightedNodeIds);
  const activeTab = useUIChromeStore((s) => s.sidebarTab);
  const setActiveTab = useUIChromeStore((s) => s.setSidebarTab);
  const sidebarVisible = useUIChromeStore((s) => s.sidebarVisible);
  const sidebarRef = useRef<PanelImperativeHandle>(null);

  // Drive the collapse/expand imperative API from the UI-store flag so
  // the Toolbar's sidebar button toggles the same thing as a user drag
  // to the collapse threshold.
  useEffect(() => {
    if (sidebarVisible) sidebarRef.current?.expand();
    else sidebarRef.current?.collapse();
  }, [sidebarVisible]);

  useEffect(() => {
    if (!selectedField) return;
    if (selectedField.typeName !== selectedNodeId) setSelectedField(null);
  }, [selectedField, selectedNodeId]);

  useEffect(() => {
    if (selectedEdgeId === null) setSelectedEdge(null);
  }, [selectedEdgeId]);

  useEffect(() => {
    if (!selectedEdge) return;
    if (edgeSelectionExists(schema, selectedEdge.data)) return;
    setSelectedEdge(null);
    useGraphSelectionStore.getState().selectEdge(null);
  }, [schema, selectedEdge]);

  useEffect(() => {
    function onFieldSelect(event: Event): void {
      const detail = (event as CustomEvent<Partial<FieldSelection>>).detail;
      if (typeof detail?.typeName !== 'string' || typeof detail.fieldName !== 'string') return;
      setSelectedEdge(null);
      setSelectedField({ typeName: detail.typeName, fieldName: detail.fieldName });
      useGraphSelectionStore.getState().click(detail.typeName, 'replace');
      useUIChromeStore.getState().setSidebarVisible(true);
      useUIChromeStore.getState().setSidebarTab('properties');
    }
    document.addEventListener(TYPE_NODE_EVENT, onFieldSelect);
    return () => document.removeEventListener(TYPE_NODE_EVENT, onFieldSelect);
  }, []);

  useEffect(() => {
    function onEdgeSelect(event: Event): void {
      const detail = (event as CustomEvent<EdgeSelection>).detail;
      if (typeof detail?.edgeId !== 'string' || !detail.data) return;
      setSelectedField(null);
      setSelectedEdge(detail);
      useUIChromeStore.getState().setSidebarVisible(true);
      useUIChromeStore.getState().setSidebarTab('properties');
    }
    document.addEventListener(TYPE_EDGE_SELECT_EVENT, onEdgeSelect);
    return () => document.removeEventListener(TYPE_EDGE_SELECT_EVENT, onEdgeSelect);
  }, []);

  const createType = useCallback((kind: CreateTypeKind): void => {
    const op = createTypeOp(useUndoStore.getState().schema, kind);
    const result = useUndoStore.getState().apply(op);
    if ('error' in result || op.kind !== 'add_type') return;
    const typeName = op.type.name;
    if (kind === 'enum') useGraphLayoutStore.getState().setGraphLayout({ showEnums: true });
    setSelectedEdge(null);
    useGraphSelectionStore.getState().click(typeName, 'replace');
    useGraphSelectionStore.getState().focus(typeName);
    useUIChromeStore.getState().setSidebarVisible(true);
    useUIChromeStore.getState().setSidebarTab('properties');
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
    setSelectedEdge(null);
    setSelectedField({ typeName, fieldName: op.field.name });
    useGraphSelectionStore.getState().click(typeName, 'replace');
    useGraphSelectionStore.getState().focus({ nodeId: typeName, fieldName: op.field.name });
    useUIChromeStore.getState().setSidebarVisible(true);
    useUIChromeStore.getState().setSidebarTab('properties');
  }, []);

  const focusSelectedTypeName = useCallback((): void => {
    const typeName = useGraphSelectionStore.getState().state.primaryNodeId;
    if (!typeName) return;
    setSelectedEdge(null);
    setSelectedField(null);
    useGraphSelectionStore.getState().click(typeName, 'replace');
    useUIChromeStore.getState().setSidebarVisible(true);
    useUIChromeStore.getState().setSidebarTab('properties');
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
        setSelectedField(null);
        setSelectedEdge(null);
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
          if ('schema' in result) setSelectedField(null);
          return;
        }
        const result = useUndoStore.getState().apply({ kind: 'delete_type', name: selected });
        if ('schema' in result) {
          setSelectedField(null);
          useGraphSelectionStore.getState().clearNodes();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [createFieldForSelectedType, createType, focusSelectedTypeName, selectedField]);

  const loadSample = useCallback(() => {
    useUndoStore
      .getState()
      .apply({ kind: 'replace_schema', schema: allotment as unknown as never });
  }, []);

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

  useProjectAutoSave({
    getChat: chat.toHistory,
  });

  useSessionPersistence({
    layout,
    onRestoreSession: () => undefined,
  });

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

  const hasSelection = selectedNodeId !== null;

  // Emit generated sources for the SchemaPanel. Only runs while the
  // Schema tab is active so we don't burn cycles on every IR change
  // when the user is looking at Chat / Properties. Wrapped in try/catch
  // so a malformed intermediate state (e.g. during a multi-op chat
  // turn) surfaces as an in-panel error rather than crashing the sidebar.
  const filePath = useDocumentStore((s) => s.filePath);

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
                <div className="absolute top-2 left-2 z-10">
                  <Popover open={showGraphControls} onOpenChange={setShowGraphControls}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="secondary"
                        className="h-8 px-2 gap-1.5 shadow-sm"
                        aria-label="Graph controls"
                        title="Graph controls"
                      >
                        <SlidersHorizontal className="size-4" />
                        <ChevronDown className="size-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-72" align="start">
                      <GraphControlsPanel onClose={() => setShowGraphControls(false)} />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {hasSchema ? (
                <GraphCanvas
                  positions={positions}
                  onPositionsChange={setPositions}
                  highlightedNodeIds={highlightedNodeIds}
                />
              ) : (
                <EmptyState
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
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
              <div className={activeTab !== 'properties' ? 'hidden' : 'flex-1 overflow-y-auto'}>
                {hasSelection ? (
                  <DetailPanel
                    selection={{
                      edge: selectedEdge?.edgeId === selectedEdgeId ? selectedEdge.data : undefined,
                      typeName: selectedNodeId ?? undefined,
                      fieldName:
                        selectedField?.typeName === selectedNodeId
                          ? selectedField.fieldName
                          : undefined,
                    }}
                    onClearSelection={() => {
                      setSelectedField(null);
                      setSelectedEdge(null);
                    }}
                    onClearSelectedField={() => setSelectedField(null)}
                    onSelectField={(typeName, fieldName) => {
                      setSelectedEdge(null);
                      setSelectedField({ typeName, fieldName });
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
              <div className={activeTab !== 'chat' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                <ChatPanel chat={chat} />
              </div>
              <div className={activeTab !== 'schema' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                <SchemaPanel
                  sources={schemaEmissions.sources}
                  isEmpty={!hasSchema}
                  error={schemaEmissions.error}
                  onCopy={copyToClipboard}
                  onEnableOutput={enableSchemaOutput}
                  documentFilePath={filePath}
                  onOpenGeneratedFile={openGeneratedFile}
                  onRequestSave={() => void fileMenu.handleSave()}
                  schemaFileName={schemaFileName}
                />
              </div>
              <div className={activeTab !== 'changes' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                <ChangesPanel />
              </div>
            </div>
            <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar />
      <DocumentDialogs onForceSave={fileMenu.handleForceSave} />
      <ReconcileModal />
    </div>
  );
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
  onLoadSample,
  recentFiles,
  onOpenRecent,
  isBundle = false,
  projectName = null,
  providerLabel,
}: {
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
        <div className="relative z-10 text-center text-muted-foreground max-w-sm">
          <h1 className="text-2xl font-semibold mb-1 text-foreground tracking-tight">Contexture</h1>
          <p className="text-xs text-muted-foreground/70 mb-3">Convex model control plane</p>
          <p className="text-sm mb-4">
            Open a <code className="text-xs">.contexture.json</code> file or start chatting with
            {` ${providerLabel}`} to create one.
          </p>
          <Button onClick={onLoadSample}>Load allotment sample</Button>

          {recentFiles.length > 0 && (
            <div className="mt-6 text-left">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-2">
                <Clock className="size-3" />
                <span>Recent files</span>
              </div>
              <div className="space-y-0.5">
                {recentFiles.slice(0, 5).map((fp) => (
                  <button
                    type="button"
                    key={fp}
                    onClick={() => onOpenRecent(fp)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-secondary/60 transition-colors truncate"
                    title={fp}
                  >
                    {fp.split('/').pop()}
                    <span className="text-muted-foreground/50 ml-1.5">
                      {fp.split('/').slice(0, -1).join('/')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
