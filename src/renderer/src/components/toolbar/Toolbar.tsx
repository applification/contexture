import { useState, useRef, useEffect } from 'react'
import {
  Sun, Moon, Bot, FolderOpen, Save, SaveAll, PanelRight, ChevronDown, SlidersHorizontal
} from 'lucide-react'
import { useUIStore } from '@renderer/store/ui'
import { useClaude } from '../chat/useClaude'
import { GraphControlsPanel } from './GraphControlsPanel'
import { GraphSearchBar } from './GraphSearchBar'

interface ToolbarProps {
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
}

export function Toolbar({ onOpen, onSave, onSaveAs }: ToolbarProps): React.JSX.Element {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  const { authMode, setAuthMode, apiKey, setApiKey, cliDetected, isReady } = useClaude()

  const [showClaudeMenu, setShowClaudeMenu] = useState(false)
  const claudeMenuRef = useRef<HTMLDivElement>(null)
  const [showGraphControls, setShowGraphControls] = useState(false)
  const graphControlsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showClaudeMenu) return
    function handleClickOutside(e: MouseEvent): void {
      if (claudeMenuRef.current && !claudeMenuRef.current.contains(e.target as Node)) {
        setShowClaudeMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showClaudeMenu])

  useEffect(() => {
    if (!showGraphControls) return
    function handleClickOutside(e: MouseEvent): void {
      if (graphControlsRef.current && !graphControlsRef.current.contains(e.target as Node)) {
        setShowGraphControls(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showGraphControls])

  return (
    <div className="h-10 border-b border-border bg-card/80 backdrop-blur-sm flex items-center gap-1 shrink-0 app-drag-region relative z-50" style={{ paddingLeft: 78, paddingRight: 12 }}>
      {/* macOS traffic lights occupy ~78px */}

      {/* File ops */}
      <ToolbarButton icon={<FolderOpen size={16} />} title="Open (⌘O)" onClick={onOpen} />
      <ToolbarButton icon={<Save size={16} />} title="Save (⌘S)" onClick={onSave} />
      <ToolbarButton icon={<SaveAll size={16} />} title="Save As (⇧⌘S)" onClick={onSaveAs} />

      <div className="w-px h-5 bg-border" />

      {/* Claude auth */}
      <div className="relative" ref={claudeMenuRef}>
        <button
          onClick={() => setShowClaudeMenu(!showClaudeMenu)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Claude settings"
        >
          <Bot size={16} />
          <span className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
          <ChevronDown size={12} />
        </button>

        {showClaudeMenu && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg p-3 space-y-2 z-50" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="flex gap-1">
              <button
                onClick={() => setAuthMode('max')}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${authMode === 'max' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
              >
                Claude Max
              </button>
              <button
                onClick={() => setAuthMode('api-key')}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${authMode === 'api-key' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
              >
                API Key
              </button>
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
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-secondary text-xs rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-ring font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Stored locally. Used to call the Claude API directly.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Graph controls */}
      <div className="relative" ref={graphControlsRef}>
        <button
          onClick={() => setShowGraphControls(!showGraphControls)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Graph controls"
        >
          <SlidersHorizontal size={16} />
          <ChevronDown size={12} />
        </button>
        {showGraphControls && (
          <GraphControlsPanel onClose={() => setShowGraphControls(false)} />
        )}
      </div>

      <div className="flex-1 flex justify-center">
        <GraphSearchBar />
      </div>

      {/* Theme toggle */}
      <ToolbarButton
        icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        title="Toggle theme"
        onClick={toggleTheme}
      />

      <div className="w-px h-5 bg-border" />

      {/* Sidebar toggle */}
      <ToolbarButton
        icon={<PanelRight size={16} />}
        title="Toggle sidebar"
        onClick={toggleSidebar}
        active={sidebarVisible}
      />
    </div>
  )
}

function ToolbarButton({
  icon, title, onClick, active
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
  active?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'text-foreground bg-secondary'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      {icon}
    </button>
  )
}
