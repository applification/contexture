import { useEffect, useCallback, useRef, useState } from 'react'
import { GraphCanvas } from './components/graph/GraphCanvas'
import { DetailPanel } from './components/detail/DetailPanel'
import { ChatPanel } from './components/chat/ChatPanel'
import { StatusBar } from './components/status-bar/StatusBar'
import { Toolbar } from './components/toolbar/Toolbar'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs'
import { Button } from './components/ui/button'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { useOntologyStore } from './store/ontology'
import { useUIStore } from './store/ui'
import { useHistoryStore } from './store/history'
import peopleTtl from './samples/people.ttl?raw'

function App(): React.JSX.Element {
  const ontology = useOntologyStore((s) => s.ontology)
  const loadFromTurtle = useOntologyStore((s) => s.loadFromTurtle)
  const exportToTurtle = useOntologyStore((s) => s.exportToTurtle)
  const setFilePath = useOntologyStore((s) => s.setFilePath)
  const markClean = useOntologyStore((s) => s.markClean)
  const selectedNodeId = useUIStore((s) => s.selectedNodeId)
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId)
  const setSelectedNode = useUIStore((s) => s.setSelectedNode)
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge)
  const removeClass = useOntologyStore((s) => s.removeClass)
  const undo = useHistoryStore((s) => s.undo)
  const canUndo = useHistoryStore((s) => s.canUndo)

  const handleOpen = useCallback(async () => {
    const result = await window.api.openFile()
    if (result) {
      loadFromTurtle(result.content, result.filePath)
    }
  }, [loadFromTurtle])

  const handleSave = useCallback(async () => {
    const turtle = exportToTurtle()
    const currentPath = useOntologyStore.getState().filePath
    if (currentPath && !currentPath.startsWith('sample://') && !currentPath.startsWith('Sample:')) {
      await window.api.saveFile(currentPath, turtle)
      markClean()
    } else {
      const newPath = await window.api.saveFileAs(turtle)
      if (newPath) {
        setFilePath(newPath)
        markClean()
      }
    }
  }, [exportToTurtle, setFilePath, markClean])

  const handleSaveAs = useCallback(async () => {
    const turtle = exportToTurtle()
    const newPath = await window.api.saveFileAs(turtle)
    if (newPath) {
      setFilePath(newPath)
      markClean()
    }
  }, [exportToTurtle, setFilePath, markClean])

  // Menu events
  useEffect(() => {
    const cleanups = [
      window.api.onMenuFileOpen(handleOpen),
      window.api.onMenuFileSave(handleSave),
      window.api.onMenuFileSaveAs(handleSaveAs)
    ]
    return () => cleanups.forEach((fn) => fn())
  }, [handleOpen, handleSave, handleSaveAs])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Escape — deselect
      if (e.key === 'Escape') {
        setSelectedNode(null)
        setSelectedEdge(null)
      }

      // Cmd+Z — undo ontology edit
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !inInput && canUndo) {
        e.preventDefault()
        undo()
      }

      // Delete/Backspace — delete selected node (when not in an input)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !inInput) {
        e.preventDefault()
        removeClass(selectedNodeId)
        setSelectedNode(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, setSelectedNode, setSelectedEdge, removeClass, undo, canUndo])

  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const sidebarRef = useRef<PanelImperativeHandle>(null)

  useEffect(() => {
    if (sidebarVisible) {
      sidebarRef.current?.expand()
    } else {
      sidebarRef.current?.collapse()
    }
  }, [sidebarVisible])

  const [activeTab, setActiveTab] = useState<'properties' | 'chat'>('chat')

  const classCount = ontology.classes.size
  const hasContent = classCount > 0
  const hasSelection = selectedNodeId !== null || selectedEdgeId !== null

  useEffect(() => {
    if (hasSelection) setActiveTab('properties')
  }, [hasSelection])

  return (
    <div className="flex flex-col h-full w-full">
      <Toolbar onOpen={handleOpen} onSave={handleSave} onSaveAs={handleSaveAs} />

      <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden" id="main-layout">
        {/* Graph Canvas - main area */}
        <ResizablePanel id="graph-panel" defaultSize="70%" minSize="30%" order={1}>
          {hasContent ? (
            <GraphCanvas />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--graph-bg)' }}>
              <div className="text-center text-muted-foreground">
                <h1 className="text-2xl font-semibold mb-2">Ontograph</h1>
                <p className="text-sm mb-4">
                  Open a .ttl file or start chatting with Claude to create an ontology
                </p>
                <Button onClick={() => loadFromTurtle(peopleTtl, 'Sample: people.ttl')}>
                  Load sample ontology
                </Button>
              </div>
            </div>
          )}
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
          order={2}
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'properties' | 'chat')}
            className="h-full bg-background flex flex-col"
          >
            <div className="px-3 py-2 border-b border-border shrink-0 flex justify-center">
              <TabsList>
                <TabsTrigger value="properties" className="text-xs">Properties</TabsTrigger>
                <TabsTrigger value="chat" className="text-xs">Chat</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="properties" className="flex-1 overflow-y-auto m-0">
              {hasSelection ? (
                <DetailPanel />
              ) : (
                <div className="p-4 text-sm text-muted-foreground text-center mt-8">
                  Select a node or edge to view properties
                </div>
              )}
            </TabsContent>
            <TabsContent value="chat" className="flex-1 min-h-0 m-0 flex flex-col">
              <ChatPanel />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
      <StatusBar />
    </div>
  )
}

export default App
