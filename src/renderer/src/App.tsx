import { GraphCanvas } from './components/graph/GraphCanvas'
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

  const classCount = ontology.classes.size
  const propCount = ontology.objectProperties.size + ontology.datatypeProperties.size
  const hasContent = classCount > 0

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
                  onClick={() => loadSampleOntology(loadFromTurtle)}
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

      {/* Right Sidebar - Chat + Detail Panel */}
      <div className="w-80 border-l border-border bg-card flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-medium">Claude</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground text-center">
            Chat with Claude to generate and refine your ontology
          </p>
        </div>
        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Describe your ontology..."
              className="flex-1 bg-secondary text-sm rounded-md px-3 py-1.5 outline-none placeholder:text-muted-foreground"
              disabled
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function loadSampleOntology(
  loadFromTurtle: (turtle: string, path?: string) => void
): void {
  loadFromTurtle(peopleTtl, 'Sample: people.ttl')
}

export default App
