/**
 * Top toolbar — traffic-light drag region, canvas search, provider auth
 * popover, theme toggle, sidebar-visibility toggle.
 *
 * Provider settings use the Schema agent runtime.
 */

import {
  SCHEMA_AGENT_PROVIDER_CHANGED,
  type SchemaAgentProvider,
} from '@renderer/chat/useSchemaAgentChat';
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
  const [provider, setProviderState] = useState<SchemaAgentProvider>(
    () =>
      (localStorage.getItem('contexture-schema-agent-provider') as SchemaAgentProvider | null) ??
      'codex',
  );
  const [providerReady, setProviderReady] = useState(false);
  const [providerStatus, setProviderStatus] = useState('Provider status unknown.');
  const [providerApiKey, setProviderApiKey] = useState('');
  const [providerPopoverOpen, setProviderPopoverOpen] = useState(false);
  const filePath = useDocumentStore((s) => s.filePath);
  const documentMode = useDocumentStore((s) => s.mode);

  // Project root is two dirs above the IR path (packages/contexture/<name>.contexture.json).
  const projectRoot =
    filePath && documentMode === 'project' ? filePath.split('/').slice(0, -3).join('/') : null;

  const providerLabel = provider === 'codex' ? 'Codex' : 'Claude';

  useEffect(() => {
    const listener = (event: Event) => {
      const next = (event as CustomEvent<{ provider?: unknown }>).detail?.provider;
      if (next !== 'codex' && next !== 'claude') return;
      setProviderState(next);
      localStorage.setItem('contexture-schema-agent-provider', next);
    };
    window.addEventListener(SCHEMA_AGENT_PROVIDER_CHANGED, listener);
    return () => window.removeEventListener(SCHEMA_AGENT_PROVIDER_CHANGED, listener);
  }, []);

  const applyProviderStatus = useCallback(
    (status: unknown): void => {
      const readiness =
        status && typeof status === 'object' ? (status as { readiness?: unknown }).readiness : null;
      setProviderReady(
        readiness === 'authenticated_chatgpt' ||
          readiness === 'authenticated_api_key' ||
          readiness === 'authenticated_cli',
      );
      setProviderStatus(providerStatusCopy(provider, readiness));
    },
    [provider],
  );

  const refreshProviderStatus = useCallback(async (): Promise<void> => {
    await window.contexture.schemaAgent.setProvider(provider);
    const status = await window.contexture.schemaAgent.getStatus();
    applyProviderStatus(status);
  }, [provider, applyProviderStatus]);

  useEffect(() => {
    let cancelled = false;
    window.contexture.schemaAgent
      .setProvider(provider)
      .then(() => window.contexture.schemaAgent.getStatus())
      .then((status) => {
        if (!cancelled) applyProviderStatus(status);
      })
      .catch((err) => {
        if (!cancelled) setProviderStatus(err instanceof Error ? err.message : String(err));
      });
    const unsubscribe = window.contexture.schemaAgent.onStatusChanged(applyProviderStatus);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [provider, applyProviderStatus]);

  const handleProviderChange = async (next: SchemaAgentProvider): Promise<void> => {
    setProviderState(next);
    localStorage.setItem('contexture-schema-agent-provider', next);
    window.dispatchEvent(
      new CustomEvent(SCHEMA_AGENT_PROVIDER_CHANGED, { detail: { provider: next } }),
    );
    await window.contexture.schemaAgent.setProvider(next);
    const status = await window.contexture.schemaAgent.getStatus();
    const readiness =
      status && typeof status === 'object' ? (status as { readiness?: unknown }).readiness : null;
    setProviderReady(
      readiness === 'authenticated_chatgpt' ||
        readiness === 'authenticated_api_key' ||
        readiness === 'authenticated_cli',
    );
    setProviderStatus(providerStatusCopy(next, readiness));
  };

  const handleChatGptLogin = async (): Promise<void> => {
    const flow = await window.contexture.schemaAgent.startLogin({ mode: 'chatgpt' });
    if (flow.url) window.open(flow.url, '_blank', 'noopener,noreferrer');
  };

  const handleCliLogin = async (): Promise<void> => {
    await window.contexture.schemaAgent.startLogin({ mode: 'cli-session' });
    await refreshProviderStatus();
  };

  const handleApiKeyLogin = async (): Promise<void> => {
    await window.contexture.schemaAgent.startLogin({ mode: 'api-key', apiKey: providerApiKey });
    await refreshProviderStatus();
  };

  const handleLogout = async (): Promise<void> => {
    await window.contexture.schemaAgent.logout();
    await refreshProviderStatus();
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
          if (open) void refreshProviderStatus();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 px-2 gap-1.5 text-muted-foreground hover:bg-icon-btn-hover"
            title={`${providerLabel} settings`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Bot className="size-4" />
            <span
              className={cn(
                'size-1.5 rounded-full',
                providerReady ? 'bg-success' : 'bg-muted-foreground/40',
              )}
              title={providerReady ? `${providerLabel} ready` : `${providerLabel} not configured`}
            />
            <ChevronDown className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-2" align="end">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={provider === 'codex' ? 'default' : 'secondary'}
              onClick={() => void handleProviderChange('codex')}
              className="text-xs h-7 flex-1"
            >
              Codex
            </Button>
            <Button
              size="sm"
              variant={provider === 'claude' ? 'default' : 'secondary'}
              onClick={() => void handleProviderChange('claude')}
              className="text-xs h-7 flex-1"
            >
              Claude
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{providerStatus}</p>
          <div className="flex gap-1">
            {provider === 'codex' ? (
              <Button
                size="sm"
                variant="default"
                onClick={() => void handleChatGptLogin()}
                className="text-xs h-7 flex-1"
              >
                ChatGPT
              </Button>
            ) : (
              <Button
                size="sm"
                variant="default"
                onClick={() => void handleCliLogin()}
                className="text-xs h-7 flex-1"
              >
                Claude CLI
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleLogout()}
              className="text-xs h-7 flex-1"
            >
              Logout
            </Button>
          </div>
          <div className="space-y-1.5">
            <Input
              type="password"
              value={providerApiKey}
              onChange={(e) => setProviderApiKey(e.target.value)}
              placeholder={provider === 'codex' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'}
              className="h-8 text-xs font-mono"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!providerApiKey.trim()}
              onClick={() => void handleApiKeyLogin()}
              className="text-xs h-7 w-full"
            >
              Use API key
            </Button>
          </div>
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

function providerStatusCopy(provider: SchemaAgentProvider, readiness: unknown): string {
  const label = provider === 'codex' ? 'Codex' : 'Claude';
  if (readiness === 'authenticated_chatgpt') return `${label} authenticated with ChatGPT.`;
  if (readiness === 'authenticated_api_key') return `${label} authenticated with API key.`;
  if (readiness === 'authenticated_cli') return `${label} CLI session available.`;
  if (readiness === 'cli_missing') return `${label} CLI not detected.`;
  if (readiness === 'cli_outdated') return `${label} CLI is outdated.`;
  if (readiness === 'not_signed_in') return `${label} is not signed in.`;
  if (readiness === 'rate_limited') return `${label} is rate-limited.`;
  if (readiness === 'app_server_unavailable') return `${label} app-server is unavailable.`;
  return `${label} is not ready.`;
}
