import { GraphCanvas } from './components/graph/GraphCanvas'
import { DetailPanel } from './components/detail/DetailPanel'
import { ValidationPanel } from './components/validation/ValidationPanel'
import { useOntologyStore } from './store/ontology'
import { useUIStore } from './store/ui'
import './components/graph/graph-node-styles.css'
import peopleTtl from './samples/people.ttl?raw'

function App(): React.JSX.Element {
  const ontology = useOntologyStore((s) => s.ontology)
  const filePath = useOntologyStore((s) => s.filePath)
  const isDirty = useOntologyStore((s) => s.isDirty)
  const loadFromTurtle = useOntologyStore((s) => s.loadFromTurtle)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const theme = useUIStore((s) => s.theme)
  const selectedNodeId = useUIStore((s) => s.selectedNodeId)
  const selectedEdgeId = useUIStore((s) => s.selectedEdgeId)

  const classCount = ontology.classes.size
  const propCount = ontology.objectProperties.size + ontology.datatypeProperties.size
  const hasContent = classCount > 0
  const hasSelection = selectedNodeId !== null || selectedEdgeId !== null

  return (
    <div className="flex h-full w-full">
      {/* Graph Canvas - main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 relative">
          {hasContent ? (
            <GraphCanvas />
          ) : (
            <div className="w-full h-full bg-[var(--graph-bg)] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <h1 className="text-2xl font-semibold mb-2">Ontograph</h1>
                <p className="text-sm mb-4">
                  Open a .ttl file or start chatting with Claude to create an ontology
                </p>
                <button
                  onClick={() => loadFromTurtle(peopleTtl, 'Sample: people.ttl')}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
                >
                  Load sample ontology
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="h-7 border-t border-border bg-card px-3 flex items-center text-xs text-muted-foreground gap-4 shrink-0">
          <span>{filePath ? `${filePath}${isDirty ? ' *' : ''}` : 'No file open'}</span>
          <span className="ml-auto flex items-center gap-3">
            <span>
              {classCount} classes &middot; {propCount} properties
            </span>
            <button
              onClick={toggleTheme}
              className="hover:text-foreground transition-colors"
              title="Toggle theme"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </span>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 border-l border-border bg-card flex flex-col shrink-0">
        {/* Detail Panel (when something selected) */}
        {hasSelection && (
          <div className="border-b border-border overflow-y-auto max-h-[50%]">
            <div className="px-3 py-2 border-b border-border bg-card sticky top-0">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Properties
              </h2>
            </div>
            <DetailPanel />
          </div>
        )}

        {/* Chat Panel */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Claude
            </h2>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-xs text-muted-foreground text-center">
              Chat with Claude to generate and refine your ontology
            </p>
          </div>
          <div className="p-3 border-t border-border">
            <input
              type="text"
              placeholder="Describe your ontology..."
              className="w-full bg-secondary text-sm rounded-md px-3 py-1.5 outline-none placeholder:text-muted-foreground"
              disabled
            />
          </div>
        </div>

        {/* Validation Panel */}
        {hasContent && (
          <div className="border-t border-border">
            <div className="px-3 py-2 border-b border-border">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Validation
              </h2>
            </div>
            <ValidationPanel />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
