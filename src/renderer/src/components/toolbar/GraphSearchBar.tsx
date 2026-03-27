import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { useOntologyStore } from '@renderer/store/ontology'
import { useUIStore } from '@renderer/store/ui'

interface Result {
  id: string
  label: string
  matchType?: string
}

function localName(uri: string): string {
  const hash = uri.lastIndexOf('#')
  const slash = uri.lastIndexOf('/')
  const idx = Math.max(hash, slash)
  return idx >= 0 ? uri.substring(idx + 1) : uri
}

export function GraphSearchBar(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const setFocusNode = useUIStore((s) => s.setFocusNode)
  const ontology = useOntologyStore((s) => s.ontology)
  const classes = ontology.classes

  // Cmd+F / Ctrl+F to focus
  useEffect(() => {
    function handler(e: KeyboardEvent): void {
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Search against ontology store
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setResults([])
      setOpen(false)
      return
    }

    const matches: Result[] = []
    for (const cls of classes.values()) {
      const label = cls.label || localName(cls.uri)
      if (label.toLowerCase().includes(q)) {
        matches.push({ id: cls.uri, label, matchType: 'label' })
      } else if (cls.uri.toLowerCase().includes(q)) {
        matches.push({ id: cls.uri, label: `${label} (URI)`, matchType: 'uri' })
      } else if (cls.comment?.toLowerCase().includes(q)) {
        matches.push({ id: cls.uri, label: `${label} (comment)`, matchType: 'comment' })
      }
    }
    // Also search object properties (match shows domain class)
    for (const prop of ontology.objectProperties.values()) {
      const propLabel = prop.label || localName(prop.uri)
      if (propLabel.toLowerCase().includes(q) || prop.uri.toLowerCase().includes(q)) {
        const domainUri = prop.domain[0]
        if (domainUri && !matches.some((m) => m.id === domainUri)) {
          const domainLabel = classes.get(domainUri)?.label || localName(domainUri)
          matches.push({ id: domainUri, label: `${domainLabel} (via ${propLabel})`, matchType: 'property' })
        }
      }
    }
    setResults(matches.slice(0, 10))
    setActiveIndex(0)
    setOpen(matches.length > 0)
  }, [query, classes])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function selectNode(id: string): void {
    setFocusNode(id)
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      selectNode(results[activeIndex].id)
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 max-w-56 mx-3"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary rounded-md border border-transparent focus-within:border-ring transition-colors">
        <Search size={13} className="text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search label, URI, comment…"
          className="flex-1 min-w-0 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/50"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false) }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectNode(r.id)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                i === activeIndex
                  ? 'bg-secondary text-foreground'
                  : 'text-foreground hover:bg-secondary/60'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
