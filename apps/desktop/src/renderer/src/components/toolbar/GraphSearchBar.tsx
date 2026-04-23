/**
 * Canvas search bar — focuses a type by name.
 *
 * Contexture IRs only have `TypeDef`s (objects / enums / discriminated
 * unions / raw) — no OWL classes, individuals, object/datatype
 * properties. So the search surface is simpler than the pre-pivot
 * `GraphSearchBar`: we match against `TypeDef.name` and
 * `TypeDef.description`. Results route via the selection store's
 * `focus(id)` which `GraphCanvas` watches to recentre the view.
 *
 * Keybindings mirror the pre-pivot app: Cmd/Ctrl+F focuses the input;
 * ↑/↓ navigate; Enter picks; Escape clears.
 */

import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

interface Result {
  name: string;
  matchType: 'name' | 'description';
}

export function GraphSearchBar(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const focus = useGraphSelectionStore((s) => s.focus);
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);

  // Cmd/Ctrl+F focuses the input.
  useEffect(() => {
    function handler(e: KeyboardEvent): void {
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches: Result[] = [];
    for (const t of schema.types) {
      if (t.name.toLowerCase().includes(q)) {
        matches.push({ name: t.name, matchType: 'name' });
      } else if (t.description?.toLowerCase().includes(q)) {
        matches.push({ name: t.name, matchType: 'description' });
      }
    }
    return matches.slice(0, 10);
  }, [query, schema]);

  useEffect(() => {
    setActiveIndex(0);
    setOpen(results.length > 0);
  }, [results]);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function pick(name: string): void {
    focus(name);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      pick(results[activeIndex].name);
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
          onKeyDown={onKeyDown}
          placeholder="Search types…"
          className="flex-1 min-w-0 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/50"
          aria-label="Search types"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          {results.map((r, i) => (
            <button
              type="button"
              key={r.name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r.name)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                i === activeIndex
                  ? 'bg-secondary text-foreground'
                  : 'text-foreground hover:bg-secondary/60'
              }`}
            >
              {r.name}
              {r.matchType === 'description' && (
                <span className="text-muted-foreground/60 ml-1.5">(in description)</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
