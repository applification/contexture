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
import { useUIStore } from '@renderer/store/ui';
import { Bot, ChevronDown, Moon, PanelRight, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { GraphSearchBar } from './GraphSearchBar';

export function Toolbar(): React.JSX.Element {
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { authMode, setAuthMode, apiKey, setApiKey, cliDetected, isReady } = useClaude();

  return (
    <div
      className="h-10 border-b border-border bg-card/80 backdrop-blur-sm flex items-center gap-1 shrink-0 app-drag-region relative z-50"
      // Leave ≈78px on the left so macOS traffic lights have room.
      style={{ paddingLeft: 78, paddingRight: 12 }}
    >
      <div className="flex-1 flex justify-center">
        <GraphSearchBar />
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title="Toggle theme"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 px-2 gap-1.5 text-muted-foreground hover:bg-icon-btn-hover"
            title="Claude settings"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Bot className="size-4" />
            <span
              className={cn(
                'size-1.5 rounded-full',
                isReady ? 'bg-success' : 'bg-muted-foreground/40',
              )}
              title={isReady ? 'Claude ready' : 'Claude not configured'}
            />
            <ChevronDown className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-2" align="end">
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
