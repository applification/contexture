/**
 * Top toolbar — hosts the traffic-light drag region, canvas search,
 * theme toggle, and sidebar-visibility toggle.
 *
 * The pre-pivot `Toolbar` also carried a Claude auth popover. That UI
 * was coupled to a bespoke `useClaude` hook and an IPC surface that no
 * longer exists in the pivoted app — auth now lives inside the Agent
 * SDK session (plugin-based). A replacement popover lands alongside a
 * Contexture-shaped auth surface; for now the toolbar stays focused
 * on window chrome.
 */

import { useUIStore } from '@renderer/store/ui';
import { Moon, PanelRight, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GraphSearchBar } from './GraphSearchBar';

export function Toolbar(): React.JSX.Element {
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

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
