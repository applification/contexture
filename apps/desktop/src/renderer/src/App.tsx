/**
 * Contexture app shell.
 *
 * Layout (mirrors the pre-pivot app, minus OWL-only surfaces):
 *
 *   ┌───────────────────────── Toolbar ─────────────────────────┐
 *   ├──────────────────────────────────────────┬────────────────┤
 *   │                                          │ SidePanel      │
 *   │             GraphCanvas                  │  (Detail /     │
 *   │                                          │   Chat /       │
 *   │                                          │   Eval)        │
 *   │                                          │  + ActivityBar │
 *   ├──────────────────────────── StatusBar ───┴────────────────┤
 *   └───────────────────────────────────────────────────────────┘
 *
 * Canvas and side panel sit inside a `ResizablePanelGroup` so the
 * split is drag-adjustable and the side panel can collapse when
 * `useUIStore.sidebarVisible` is false (toggled by the Toolbar's
 * sidebar button).
 */

import { ChevronDown, Clock, MousePointer2, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { evalRootCandidates } from './chat/eval-prompt';
import { useClaudeEval } from './chat/useClaudeEval';
import { useClaudeSchemaChat } from './chat/useClaudeSchemaChat';
import { ActivityBar } from './components/activity-bar/ActivityBar';
import { ChatPanel } from './components/chat/ChatPanel';
import { DetailPanel } from './components/detail/DetailPanel';
import { DocumentDialogs } from './components/dialogs/DocumentDialogs';
import { EvalPanel } from './components/eval/EvalPanel';
import { GraphBackground } from './components/graph/GraphBackground';
import { type CanvasPosition, GraphCanvas } from './components/graph/GraphCanvas';
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
import { useFileMenu } from './hooks/useFileMenu';
import { emit as emitJsonSchema } from './model/emit-json-schema';
import allotment from './samples/allotment.contexture.json' with { type: 'json' };
import { STDLIB_REGISTRY } from './services/stdlib-registry';
import { validate } from './services/validation';
import { useUIStore } from './store/ui';
import { useUndoStore } from './store/undo';

export default function App(): React.JSX.Element {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const hasSchema = schema.types.length > 0;

  const [positions, setPositions] = useState<Record<string, CanvasPosition>>({});
  const [showGraphControls, setShowGraphControls] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const activeTab = useUIStore((s) => s.sidebarTab);
  const setActiveTab = useUIStore((s) => s.setSidebarTab);
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
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
        useUIStore.getState().setSelectedNode(null);
        useUIStore.getState().setSelectedEdge(null);
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
        const selected = useUIStore.getState().selectedNodeId;
        if (!selected) return;
        ev.preventDefault();
        const result = useUndoStore.getState().apply({ kind: 'delete_type', name: selected });
        if ('schema' in result) useUIStore.getState().setSelectedNode(null);
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

  const chat = useClaudeSchemaChat({
    api:
      typeof window !== 'undefined' && window.contexture?.chat
        ? window.contexture.chat
        : noopChatApi(),
  });

  const fileMenu = useFileMenu();

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

  const ev = useClaudeEval({
    api: {
      generate: async () => ({ sample: {} }),
      saveFixture: async () => '',
    },
    ir: schema,
    getRootJsonSchema: (rootTypeName) => emitJsonSchema(schema, rootTypeName),
    validate: ({ rootTypeName }) => {
      const errors = validate(schema, { stdlib: STDLIB_REGISTRY });
      return errors.length === 0
        ? { ok: true }
        : {
            ok: false,
            errors: errors.map((e) => ({
              path: e.path,
              message: `${rootTypeName}: ${e.message}`,
            })),
          };
    },
  });

  const rootCandidates = useMemo(() => evalRootCandidates(schema), [schema]);
  const hasSelection = selectedNodeId !== null;

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
          <div className="relative w-full h-full">
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
              />
            )}
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
              <div className={activeTab !== 'eval' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                <EvalPanel eval={ev} rootCandidates={rootCandidates} onCopy={copyToClipboard} />
              </div>
            </div>
            <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar />
      <DocumentDialogs onForceSave={fileMenu.handleForceSave} />
    </div>
  );
}

function EmptyState({
  onLoadSample,
  recentFiles,
  onOpenRecent,
}: {
  onLoadSample: () => void;
  recentFiles: string[];
  onOpenRecent: (path: string) => void;
}): React.JSX.Element {
  return (
    <div
      className="relative w-full h-full flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--graph-bg)' }}
    >
      <GraphBackground />
      <div className="relative z-10 text-center text-muted-foreground max-w-sm">
        <h1 className="text-2xl font-semibold mb-1 text-foreground tracking-tight">Contexture</h1>
        <p className="text-xs text-muted-foreground/70 mb-3">Visual Zod schema editor</p>
        <p className="text-sm mb-4">
          Open a <code className="text-xs">.contexture.json</code> file or start chatting with
          Claude to create one.
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
    </div>
  );
}

function copyToClipboard(text: string): void {
  if (typeof navigator === 'undefined') return;
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function noopChatApi() {
  const unsub = () => undefined;
  return {
    send: async () => ({ ok: false, error: 'chat unavailable (no preload bridge)' }),
    setIR: () => undefined,
    detectClaudeCli: async () => ({ installed: false, path: null }),
    setAuth: async () => ({ ok: false, error: 'chat unavailable' }),
    setModelOptions: async () => ({ ok: false }),
    abort: async () => ({ ok: false, error: 'chat unavailable' }),
    replyOp: () => undefined,
    onAssistant: () => unsub,
    onToolUse: () => unsub,
    onResult: () => unsub,
    onError: () => unsub,
    onTurnBegin: () => unsub,
    onTurnCommit: () => unsub,
    onTurnRollback: () => unsub,
    onOpRequest: () => unsub,
  };
}
