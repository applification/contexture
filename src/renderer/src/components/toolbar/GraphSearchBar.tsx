import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { getCyInstance } from '@renderer/components/graph/cyRef'
import { useUIStore } from '@renderer/store/ui'

interface Result {
  id: string
  label: string
}

export function GraphSearchBar(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const setSelectedNode = useUIStore((s) => s.setSelectedNode)

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

  // Search on query change
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setResults([])
      setOpen(false)
      return
    }
    const cy = getCyInstance()
    if (!cy) return

    const matches: Result[] = []
    cy.nodes('[type = "class"]').forEach((node) => {
      const label = node.data('label') as string
      if (label?.toLowerCase().includes(q)) {
        matches.push({ id: node.id(), label })
      }
    })
    setResults(matches.slice(0, 8))
    setActiveIndex(0)
    setOpen(matches.length > 0)
  }, [query])

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
    const cy = getCyInstance()
    if (!cy) return
    const node = cy.getElementById(id)
    if (!node.length) return

    setSelectedNode(id)
    cy.animate(
      { center: { eles: node }, zoom: Math.max(cy.zoom(), 1.5) },
      { duration: 350 }
    )

    // Flash highlight
    node.addClass('search-hit')
    setTimeout(() => node.removeClass('search-hit'), 1500)

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
          placeholder="Find node…"
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
