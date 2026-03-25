function App(): React.JSX.Element {
  return (
    <div className="flex h-full w-full">
      {/* Graph Canvas - main area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 bg-[var(--graph-bg)] flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <h1 className="text-2xl font-semibold mb-2">Ontograph</h1>
            <p className="text-sm">Open a .ttl file or start chatting with Claude to create an ontology</p>
          </div>
        </div>

        {/* Status Bar */}
        <div className="h-7 border-t border-border bg-card px-3 flex items-center text-xs text-muted-foreground gap-4">
          <span>No file open</span>
          <span className="ml-auto">0 classes &middot; 0 properties &middot; 0 tokens</span>
        </div>
      </div>

      {/* Right Sidebar - Chat + Detail Panel */}
      <div className="w-80 border-l border-border bg-card flex flex-col">
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

export default App
