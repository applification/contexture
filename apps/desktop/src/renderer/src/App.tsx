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

import type { Layout } from '@contexture/core';
import {
  emitGeneratedTarget,
  enableGeneratedTarget,
  isGeneratedTargetEnabled,
  previewableGeneratedTargets,
} from '@contexture/core/generated-targets';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { ChevronDown, Clock, MousePointer2, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { useSchemaAgentChat } from './chat/useSchemaAgentChat';
import { ActivityBar } from './components/activity-bar/ActivityBar';
import { ChatPanel } from './components/chat/ChatPanel';
import { DetailPanel } from './components/detail/DetailPanel';
import { DocumentDialogs } from './components/dialogs/DocumentDialogs';
import { ReconcileModal } from './components/dialogs/ReconcileModal';
import { GraphBackground } from './components/graph/GraphBackground';
import { type CanvasPosition, GraphCanvas } from './components/graph/GraphCanvas';
import { DriftBanner } from './components/hud/DriftBanner';
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
import { useProjectAutoSave } from './hooks/useProjectAutoSave';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import allotment from './samples/allotment.contexture.json' with { type: 'json' };
import { useDocumentStore } from './store/document';
import { useGraphSelectionStore } from './store/selection';
import { useUIChromeStore } from './store/ui-chrome';
import { useUndoStore } from './store/undo';

export default function App(): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const hasSchema = schema.types.length > 0;

  const [positions, setPositions] = useState<Record<string, CanvasPosition>>({});
  const [showGraphControls, setShowGraphControls] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const selectedNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
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

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        const selected = useGraphSelectionStore.getState().state.primaryNodeId;
        if (!selected) return;
        ev.preventDefault();
        const result = useUndoStore.getState().apply({ kind: 'delete_type', name: selected });
        if ('schema' in result) useGraphSelectionStore.getState().clearNodes();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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

  // Track positions + chat in refs so `useFileMenu` getters can read
  // the live values on save without re-subscribing on every change.
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const chatMessagesRef = useRef(chat.messages);
  chatMessagesRef.current = chat.messages;
  const chatHydrateRef = useRef(chat.hydrate);
  chatHydrateRef.current = chat.hydrate;

  useDrift();

  const fileMenu = useFileMenu({
    getLayout: () => ({ version: '1', positions: positionsRef.current }),
    getChat: () => ({
      version: '1',
      messages: chatMessagesRef.current,
      provider: readProviderProp(chat),
      ...(readStringProp(chat, 'model') ? { model: readStringProp(chat, 'model') } : {}),
      ...(readStringProp(chat, 'effort') ? { effort: readStringProp(chat, 'effort') } : {}),
      ...(readModelOptionsProp(chat) ? { modelOptions: readModelOptionsProp(chat) } : {}),
      ...('providerThreadRef' in chat && chat.providerThreadRef
        ? { providerThreadRef: chat.providerThreadRef }
        : {}),
    }),
    onBundleLoaded: ({ layout, chat: loadedChat }) => {
      setPositions(layout.positions);
      restoreChatSettings(chat, loadedChat);
      chatHydrateRef.current(loadedChat.messages);
      if (loadedChat.providerThreadRef) {
        void window.contexture?.schemaAgent?.threadSet(loadedChat.providerThreadRef);
      } else {
        void window.contexture?.schemaAgent?.threadClear();
      }
    },
    onNew: () => {
      setPositions({});
      chatHydrateRef.current([]);
      void window.contexture?.schemaAgent?.threadClear();
    },
  });

  useProjectAutoSave({
    getLayout: () => ({ version: '1', positions: positionsRef.current }),
    getChat: () => ({
      version: '1',
      messages: chatMessagesRef.current,
      provider: readProviderProp(chat),
      ...(readStringProp(chat, 'model') ? { model: readStringProp(chat, 'model') } : {}),
      ...(readStringProp(chat, 'effort') ? { effort: readStringProp(chat, 'effort') } : {}),
      ...(readModelOptionsProp(chat) ? { modelOptions: readModelOptionsProp(chat) } : {}),
      ...('providerThreadRef' in chat && chat.providerThreadRef
        ? { providerThreadRef: chat.providerThreadRef }
        : {}),
    }),
  });

  const sessionLayout = useMemo<Layout>(() => ({ version: '1', positions }), [positions]);
  useSessionPersistence({
    layout: sessionLayout,
    onRestoreSession: (layout) => {
      setPositions(layout.positions);
    },
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
      <Toolbar />

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 overflow-hidden"
        id="main-layout"
      >
        <ResizablePanel id="graph-panel" defaultSize="70%" minSize="30%">
          <div className="flex flex-col w-full h-full">
            <DriftBanner />
            <div className="relative flex-1 min-h-0">
              {hasSchema && (
                <div className="absolute top-2 left-2 z-10">
                  <Popover open={showGraphControls} onOpenChange={setShowGraphControls}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="secondary"
                        className="h-8 px-2 gap-1.5 shadow-sm"
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
                <GraphCanvas positions={positions} onPositionsChange={setPositions} />
              ) : (
                <EmptyState
                  onLoadSample={loadSample}
                  recentFiles={recentFiles}
                  onOpenRecent={fileMenu.handleOpenPath}
                  isBundle={filePath !== null}
                  projectName={filePath?.split('/').at(-1)?.replace('.contexture.json', '') ?? null}
                  providerLabel={readProviderLabelProp(chat)}
                />
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel
          id="sidebar-panel"
          defaultSize="30%"
          minSize="15%"
          maxSize="60%"
          collapsible
          collapsedSize={0}
          panelRef={sidebarRef}
        >
          <div className="flex h-full bg-background">
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
              <div className={activeTab !== 'properties' ? 'hidden' : 'flex-1 overflow-y-auto'}>
                {hasSelection ? (
                  <DetailPanel selection={{ typeName: selectedNodeId ?? undefined }} />
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
                  schemaFileName={schemaFileName}
                />
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
            This bundle is ready for generated outputs. Start chatting with {providerLabel} or add
            types directly.
          </p>
          <p className="text-xs text-muted-foreground/60">
            You can iterate on the schema by continuing the conversation, or edit types directly
            once they appear on the canvas.
          </p>
        </div>
      ) : (
        <div className="relative z-10 text-center text-muted-foreground max-w-sm">
          <h1 className="text-2xl font-semibold mb-1 text-foreground tracking-tight">Contexture</h1>
          <p className="text-xs text-muted-foreground/70 mb-3">Visual Zod schema editor</p>
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

function readStringProp(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const prop = (value as Record<string, unknown>)[key];
  return typeof prop === 'string' && prop.length > 0 ? prop : undefined;
}

function readProviderProp(value: unknown): 'codex' | 'claude' {
  if (!value || typeof value !== 'object') return 'claude';
  const provider = (value as { provider?: unknown }).provider;
  return provider === 'codex' || provider === 'claude' ? provider : 'claude';
}

function readModelOptionsProp(value: unknown): Record<string, string | boolean> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const modelOptions = (value as { modelOptions?: unknown }).modelOptions;
  if (!modelOptions || typeof modelOptions !== 'object' || Array.isArray(modelOptions)) {
    return undefined;
  }
  const entries = Object.entries(modelOptions as Record<string, unknown>).filter(
    (entry): entry is [string, string | boolean] =>
      typeof entry[1] === 'string' || typeof entry[1] === 'boolean',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readProviderLabelProp(value: unknown): 'Codex' | 'Claude' {
  if (!value || typeof value !== 'object') return 'Claude';
  const providerLabel = (value as { providerLabel?: unknown }).providerLabel;
  return providerLabel === 'Codex' || providerLabel === 'Claude' ? providerLabel : 'Claude';
}

function restoreChatSettings(
  chat: unknown,
  loadedChat: {
    provider?: 'codex' | 'claude';
    model?: string;
    effort?: string;
    modelOptions?: Record<string, string | boolean>;
  },
): void {
  const restorer = (chat as { restoreSettings?: unknown }).restoreSettings;
  if (typeof restorer === 'function') {
    restorer({
      provider: loadedChat.provider,
      model: loadedChat.model,
      effort: loadedChat.effort,
      modelOptions: loadedChat.modelOptions,
    });
    return;
  }

  const modelSetter = (chat as { setModel?: unknown }).setModel;
  if (loadedChat.model && typeof modelSetter === 'function') modelSetter(loadedChat.model);
  const effortSetter = (chat as { setEffort?: unknown }).setEffort;
  if (loadedChat.effort && typeof effortSetter === 'function') effortSetter(loadedChat.effort);
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
