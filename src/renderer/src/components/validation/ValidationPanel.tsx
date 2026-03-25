import { useMemo } from 'react'
import { useOntologyStore } from '@renderer/store/ontology'
import { useUIStore } from '@renderer/store/ui'
import { validateOntology, type ValidationError } from '@renderer/services/validation'

function localName(uri: string): string {
  const idx = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'))
  return idx >= 0 ? uri.substring(idx + 1) : uri
}

export function ValidationPanel(): React.JSX.Element {
  const ontology = useOntologyStore((s) => s.ontology)
  const setSelectedNode = useUIStore((s) => s.setSelectedNode)
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge)

  const errors = useMemo(() => validateOntology(ontology), [ontology])

  const errorCount = errors.filter((e) => e.severity === 'error').length
  const warnCount = errors.filter((e) => e.severity === 'warning').length

  function handleClick(error: ValidationError): void {
    if (error.elementType === 'class') {
      setSelectedNode(error.elementUri)
      setSelectedEdge(null)
    }
  }

  if (errors.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No validation issues
      </div>
    )
  }

  return (
    <div className="text-xs">
      <div className="px-3 py-1.5 text-muted-foreground border-b border-border">
        {errorCount > 0 && <span className="text-destructive-foreground">{errorCount} errors</span>}
        {errorCount > 0 && warnCount > 0 && ' · '}
        {warnCount > 0 && <span>{warnCount} warnings</span>}
      </div>
      <div className="max-h-40 overflow-y-auto">
        {errors.map((error, i) => (
          <button
            key={i}
            onClick={() => handleClick(error)}
            className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors flex gap-2 items-start"
          >
            <span className={error.severity === 'error' ? 'text-destructive-foreground' : 'text-yellow-500'}>
              {error.severity === 'error' ? '●' : '▲'}
            </span>
            <span>
              <span className="text-muted-foreground">{localName(error.elementUri)}:</span>{' '}
              {error.message}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
