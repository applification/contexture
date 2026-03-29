import { useEffect, useCallback, useRef, useState } from 'react'
import { GraphCanvas } from './components/graph/GraphCanvas'
import { GraphBackground } from './components/graph/GraphBackground'
import { DetailPanel } from './components/detail/DetailPanel'
import { ChatPanel } from './components/chat/ChatPanel'
import { EvalPanel } from './components/eval/EvalPanel'
import { ActivityBar } from './components/activity-bar/ActivityBar'
import { ImprovementHUD } from './components/hud/ImprovementHUD'
import { StatusBar } from './components/status-bar/StatusBar'
import { Toolbar } from './components/toolbar/Toolbar'
import { GraphControlsPanel } from './components/toolbar/GraphControlsPanel'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable'
import { Button } from './components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from './components/ui/popover'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { SlidersHorizontal, ChevronDown, CircleAlert, TriangleAlert, Clock } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useOntologyStore } from './store/ontology'
import { useUIStore } from './store/ui'
import { useHistoryStore } from './store/history'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from './components/ui/empty'
import { UpdateBanner } from './components/UpdateBanner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog'
import { MousePointer2 } from 'lucide-react'
import { validateOntology } from './services/validation'
import peopleTtl from './samples/people.ttl?raw'

function App(): React.JSX.Element {
  const ontology = useOntologyStore((s) => s.ontology)
  const loadFromTurtle = useOntologyStore((s) => s.loadFromTurtle)
  const exportToTurtle = useOntologyStore((s) => s.exportToTurtle)
  const setFilePath = useOntologyStore((s) => s.setFilePath)
  const markClean = useOntologyStore((s) => s.markClean)
  const isDirty = useOntologyStore((s) => s.isDirty)
  const importWarnings = useOntologyStore((s) => s.importWarnings)
  const clearImportWarnings = useOntologyStore((s) => s.clearImportWarnings)
  const resetOntology = useOntologyStore((s) => s.reset)
  const selectedNodeId = useUIStore((s) => s.selectedNodeId)
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId)
  const setSelectedNode = useUIStore((s) => s.setSelectedNode)
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge)
  const removeClass = useOntologyStore((s) => s.removeClass)
  const undo = useHistoryStore((s) => s.undo)
  const canUndo = useHistoryStore((s) => s.canUndo)

  const [showNewDialog, setShowNewDialog] = useState(false)
  const [showSaveWarning, setShowSaveWarning] = useState(false)
  const pendingSaveRef = useRef<'save' | 'saveAs' | null>(null)
  const [showGraphControls, setShowGraphControls] = useState(false)
  const [recentFiles, setRecentFiles] = useState<string[]>([])

  const handleOpen = useCallback(async () => {
    const result = await window.api.openFile()
    if (result) {
      loadFromTurtle(result.content, result.filePath)
    }
  }, [loadFromTurtle])

  const doSave = useCallback(async () => {
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

  const doSaveAs = useCallback(async () => {
    const turtle = exportToTurtle()
    const newPath = await window.api.saveFileAs(turtle)
    if (newPath) {
      setFilePath(newPath)
      markClean()
    }
  }, [exportToTurtle, setFilePath, markClean])

  const handleSave = useCallback(async () => {
    const errors = validateOntology(useOntologyStore.getState().ontology)
    const errorCount = errors.filter((e) => e.severity === 'error').length
    if (errorCount > 0) {
      pendingSaveRef.current = 'save'
      setShowSaveWarning(true)
      return
    }
    await doSave()
  }, [doSave])

  const handleSaveAs = useCallback(async () => {
    const errors = validateOntology(useOntologyStore.getState().ontology)
    const errorCount = errors.filter((e) => e.severity === 'error').length
    if (errorCount > 0) {
      pendingSaveRef.current = 'saveAs'
      setShowSaveWarning(true)
      return
    }
    await doSaveAs()
  }, [doSaveAs])

  const handleForceSave = useCallback(async () => {
    setShowSaveWarning(false)
    if (pendingSaveRef.current === 'saveAs') {
      await doSaveAs()
    } else {
      await doSave()
    }
    pendingSaveRef.current = null
  }, [doSave, doSaveAs])

  const handleNew = useCallback(() => {
    if (isDirty) {
      setShowNewDialog(true)
    } else {
      resetOntology()
    }
  }, [isDirty, resetOntology])

  // Menu events
  useEffect(() => {
    const cleanups = [
      window.api.onMenuFileNew(handleNew),
      window.api.onMenuFileOpen(handleOpen),
      window.api.onMenuFileSave(handleSave),
      window.api.onMenuFileSaveAs(handleSaveAs)
    ]
    return () => cleanups.forEach((fn) => fn())
  }, [handleNew, handleOpen, handleSave, handleSaveAs])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      if (e.key === 'Escape') {
        setSelectedNode(null)
        setSelectedEdge(null)
      }

      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !inInput && canUndo) {
        e.preventDefault()
        undo()
      }

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

  const activeTab = useUIStore((s) => s.sidebarTab)
  const setActiveTab = useUIStore((s) => s.setSidebarTab)

  // Load recent files on mount and after opens
  useEffect(() => {
    window.api.getRecentFiles().then(setRecentFiles).catch(() => {})
  }, [ontology])

  const handleOpenRecent = useCallback(async (filePath: string) => {
    const result = await window.api.openRecentFile(filePath)
    if (result) {
      loadFromTurtle(result.content, result.filePath)
    }
  }, [loadFromTurtle])

  const hasContent = ontology.classes.size > 0
  const hasSelection = selectedNodeId !== null || selectedEdgeId !== null

  return (
    <div className="flex flex-col h-full w-full">
      <UpdateBanner />
      <Toolbar />

      <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden" id="main-layout">
        {/* Graph Canvas */}
        <ResizablePanel id="graph-panel" defaultSize="70%" minSize="30%">
          <div className="relative w-full h-full">
            {/* Graph controls overlay — top left */}
            <div className="absolute top-2 left-2 z-10">
              <Popover open={showGraphControls} onOpenChange={setShowGraphControls}>
                <PopoverTrigger asChild>
                  <Button variant="secondary" className="h-8 px-2 gap-1.5 shadow-sm" title="Graph filters">
                    <SlidersHorizontal className="size-4" />
                    <ChevronDown className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-72" align="start">
                  <AnimatePresence>
                    {showGraphControls && (
                      <GraphControlsPanel onClose={() => setShowGraphControls(false)} />
                    )}
                  </AnimatePresence>
                </PopoverContent>
              </Popover>
            </div>

            {hasContent ? (
              <GraphCanvas />
            ) : (
              <div className="relative w-full h-full flex items-center justify-center" style={{ background: 'var(--graph-bg)' }}>
                <GraphBackground />
                <div className="relative z-10 text-center text-muted-foreground max-w-sm">
                  <h1 className="text-2xl font-semibold mb-1 text-foreground tracking-tight">Ontograph</h1>
                  <p className="text-xs text-muted-foreground/70 mb-3">Where knowledge takes shape</p>
                  <p className="text-sm mb-4">
                    Open a .ttl file or start chatting with Claude to create an ontology
                  </p>
                  <Button onClick={() => loadFromTurtle(peopleTtl, 'Sample: people.ttl')}>
                    Load sample ontology
                  </Button>

                  {recentFiles.length > 0 && (
                    <div className="mt-6 text-left">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-2">
                        <Clock className="size-3" />
                        <span>Recent files</span>
                      </div>
                      <div className="space-y-0.5">
                        {recentFiles.slice(0, 5).map((fp) => (
                          <button
                            key={fp}
                            onClick={() => handleOpenRecent(fp)}
                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-secondary/60 transition-colors truncate"
                            title={fp}
                          >
                            {fp.split('/').pop()}
                            <span className="text-muted-foreground/50 ml-1.5">{fp.split('/').slice(0, -1).join('/')}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <ImprovementHUD />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Sidebar */}
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
            {/* Panel content */}
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
              <div className={activeTab !== 'properties' ? 'hidden' : 'flex-1 overflow-y-auto'}>
                {hasSelection ? (
                  <DetailPanel />
                ) : (
                  <Empty className="border-0 p-4">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <MousePointer2 />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm font-medium">No selection</EmptyTitle>
                      <EmptyDescription className="text-xs">
                        Select a node or edge to view and edit its properties.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
              <div className={activeTab !== 'chat' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                <ChatPanel />
              </div>
              <div className={activeTab !== 'eval' ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                <EvalPanel />
              </div>
            </div>

            {/* Activity bar */}
            <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar />

      <Dialog open={importWarnings.length > 0} onOpenChange={(open) => { if (!open) clearImportWarnings() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import warnings</DialogTitle>
            <DialogDescription>
              The file was loaded but some issues were detected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-48 overflow-y-auto text-sm">
            {importWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                {w.severity === 'error' ? (
                  <CircleAlert className="size-4 shrink-0 mt-0.5 text-destructive" />
                ) : (
                  <TriangleAlert className="size-4 shrink-0 mt-0.5 text-warning" />
                )}
                <span>{w.message}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={clearImportWarnings}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveWarning} onOpenChange={setShowSaveWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save with errors?</DialogTitle>
            <DialogDescription>
              This ontology has validation errors. Saving may produce an invalid file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSaveWarning(false); pendingSaveRef.current = null }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleForceSave}>
              Save anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={async () => { await handleSave(); resetOntology(); setShowNewDialog(false) }}>
              Save & New
            </Button>
            <Button variant="destructive" onClick={() => { resetOntology(); setShowNewDialog(false) }}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
