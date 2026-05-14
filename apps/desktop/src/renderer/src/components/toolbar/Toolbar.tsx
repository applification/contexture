/**
 * Top toolbar — traffic-light drag region, canvas search, Claude auth
 * popover, theme toggle, sidebar-visibility toggle.
 *
 * The Claude popover lets the user flip between Max (Claude CLI / OAuth)
 * and raw API-key modes. Auth settings round-trip through the preload
 * surface and live in localStorage (`useClaude`) so they survive
 * restarts; the main process re-reads them per SDK `query()` call.
 */

import { useClaude } from '@renderer/chat/useClaude';
import { useDocumentStore } from '@renderer/store/document';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { Bot, ChevronDown, Code, Moon, PanelRight, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { GraphSearchBar } from './GraphSearchBar';

export function Toolbar(): React.JSX.Element {
  const theme = useUIChromeStore((s) => s.theme);
  const toggleTheme = useUIChromeStore((s) => s.toggleTheme);
  const sidebarVisible = useUIChromeStore((s) => s.sidebarVisible);
  const toggleSidebar = useUIChromeStore((s) => s.toggleSidebar);
  const { authMode, setAuthMode, apiKey, setApiKey, cliDetected, isReady } = useClaude();
  const schemaAgentAvailable = typeof window !== 'undefined' && !!window.contexture?.schemaAgent;
  const [codexReady, setCodexReady] = useState(false);
  const [codexStatus, setCodexStatus] = useState('Codex status unknown.');
  const [codexApiKey, setCodexApiKey] = useState('');
  const [providerPopoverOpen, setProviderPopoverOpen] = useState(false);
  const filePath = useDocumentStore((s) => s.filePath);
  const documentMode = useDocumentStore((s) => s.mode);

  // Project root is two dirs above the IR path (packages/contexture/<name>.contexture.json).
  const projectRoot =
    filePath && documentMode === 'project' ? filePath.split('/').slice(0, -3).join('/') : null;

  const applyCodexStatus = useCallback((status: unknown): void => {
    const readiness =
      status && typeof status === 'object' ? (status as { readiness?: unknown }).readiness : null;
    setCodexReady(readiness === 'authenticated_chatgpt' || readiness === 'authenticated_api_key');
    setCodexStatus(codexStatusCopy(readiness));
  }, []);

  const refreshCodexStatus = useCallback(async (): Promise<void> => {
    if (!schemaAgentAvailable) return;
    const status = await window.contexture.schemaAgent.getStatus();
    applyCodexStatus(status);
  }, [schemaAgentAvailable, applyCodexStatus]);

  useEffect(() => {
    if (!schemaAgentAvailable) return;
    let cancelled = false;
    window.contexture.schemaAgent
      .getStatus()
      .then((status) => {
        if (!cancelled) applyCodexStatus(status);
      })
      .catch((err) => {
        if (!cancelled) setCodexStatus(err instanceof Error ? err.message : String(err));
      });
    const unsubscribe = window.contexture.schemaAgent.onStatusChanged(applyCodexStatus);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [schemaAgentAvailable, applyCodexStatus]);

  const handleCodexChatGptLogin = async (): Promise<void> => {
    const flow = await window.contexture.schemaAgent.startLogin({ mode: 'chatgpt' });
    if (flow.url) window.open(flow.url, '_blank', 'noopener,noreferrer');
  };

  const handleCodexApiKeyLogin = async (): Promise<void> => {
    await window.contexture.schemaAgent.startLogin({ mode: 'api-key', apiKey: codexApiKey });
    await refreshCodexStatus();
  };

  const handleCodexLogout = async (): Promise<void> => {
    await window.contexture.schemaAgent.logout();
    await refreshCodexStatus();
  };

  return (
    <div
      className="h-10 border-b border-border bg-card/80 backdrop-blur-sm flex items-center gap-1 shrink-0 app-drag-region relative z-50"
      // Leave ≈78px on the left so macOS traffic lights have room.
      style={{ paddingLeft: 78, paddingRight: 12 }}
    >
      <div className="flex-1 flex justify-center">
        <GraphSearchBar />
      </div>

      {projectRoot && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Open project in VS Code"
          onClick={() => void window.contexture?.shell.openInEditor(projectRoot)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Code className="size-4" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Toggle theme"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <Popover
        open={providerPopoverOpen}
        onOpenChange={(open) => {
          setProviderPopoverOpen(open);
          if (open) void refreshCodexStatus();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 px-2 gap-1.5 text-muted-foreground hover:bg-icon-btn-hover"
            title={schemaAgentAvailable ? 'Codex settings' : 'Claude settings'}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Bot className="size-4" />
            <span
              className={cn(
                'size-1.5 rounded-full',
                (schemaAgentAvailable ? codexReady : isReady)
                  ? 'bg-success'
                  : 'bg-muted-foreground/40',
              )}
              title={
                schemaAgentAvailable
                  ? codexReady
                    ? 'Codex ready'
                    : 'Codex not configured'
                  : isReady
                    ? 'Claude ready'
                    : 'Claude not configured'
              }
            />
            <ChevronDown className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-2" align="end">
          {schemaAgentAvailable ? (
            <>
              <p className="text-xs text-muted-foreground">{codexStatus}</p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => void handleCodexChatGptLogin()}
                  className="text-xs h-7 flex-1"
                >
                  ChatGPT
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCodexLogout()}
                  className="text-xs h-7 flex-1"
                >
                  Logout
                </Button>
              </div>
              <div className="space-y-1.5">
                <Input
                  type="password"
                  value={codexApiKey}
                  onChange={(e) => setCodexApiKey(e.target.value)}
                  placeholder="OPENAI_API_KEY"
                  className="h-8 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!codexApiKey.trim()}
                  onClick={() => void handleCodexApiKeyLogin()}
                  className="text-xs h-7 w-full"
                >
                  Use API key
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={authMode === 'max' ? 'default' : 'secondary'}
                  onClick={() => setAuthMode('max')}
                  className="text-xs h-7 flex-1"
                >
                  Claude Max
                </Button>
                <Button
                  size="sm"
                  variant={authMode === 'api-key' ? 'default' : 'secondary'}
                  onClick={() => setAuthMode('api-key')}
                  className="text-xs h-7 flex-1"
                >
                  API Key
                </Button>
              </div>

              {authMode === 'max' && (
                <p className="text-xs text-muted-foreground">
                  {cliDetected
                    ? '✓ Claude CLI detected. Using your Max subscription.'
                    : '✗ Claude CLI not found. Install Claude Code and log in.'}
                </p>
              )}

              {authMode === 'api-key' && (
                <div className="space-y-1.5">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Stored locally. Used to call the Claude API directly.
                  </p>
                </div>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <Button
        variant="ghost"
        size="icon"
        className={cn('size-8', sidebarVisible && 'text-foreground bg-secondary')}
        title="Toggle sidebar"
        onClick={toggleSidebar}
      >
        <PanelRight />
      </Button>
    </div>
  );
}

function codexStatusCopy(readiness: unknown): string {
  if (readiness === 'authenticated_chatgpt') return 'Codex authenticated with ChatGPT.';
  if (readiness === 'authenticated_api_key') return 'Codex authenticated with API key.';
  if (readiness === 'cli_missing') return 'Codex CLI not detected.';
  if (readiness === 'cli_outdated') return 'Codex CLI is outdated.';
  if (readiness === 'not_signed_in') return 'Codex is not signed in.';
  if (readiness === 'rate_limited') return 'Codex is rate-limited.';
  if (readiness === 'app_server_unavailable') return 'Codex app-server is unavailable.';
  return 'Codex is not ready.';
}
