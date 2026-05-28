/**
 * Canvas search bar — focuses a type or inline enum usage by name.
 *
 * Contexture IRs only have `TypeDef`s (objects / enums / discriminated
 * unions / raw), so we match against `TypeDef.name` and
 * `TypeDef.description`. Results route via the selection store's
 * `focus(id)` which `GraphCanvas` watches to recentre the view.
 *
 * Keybindings: Cmd/Ctrl+F focuses the input; ↑/↓ navigate; Enter picks;
 * Escape clears.
 */

import type { FieldType } from '@contexture/core/ir';
import { useGraphLayoutStore } from '@renderer/store/layout-config';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { Search, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

interface Result {
  name: string;
  focusName: string;
  matchType: 'name' | 'description' | 'enum';
  kindLabel: 'object' | 'table' | 'enum' | 'union' | 'raw';
  focusFieldName?: string;
  detail?: string;
}

const KIND_BADGE_STYLES: Record<Result['kindLabel'], CSSProperties> = {
  object: badgeStyle('var(--graph-node-header-bg)'),
  table: badgeStyle('var(--graph-node-table-accent)'),
  enum: badgeStyle('var(--chart-3)'),
  union: badgeStyle('var(--graph-edge-union)'),
  raw: badgeStyle('var(--muted-foreground)'),
};

export function GraphSearchBar(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const focus = useGraphSelectionStore((s) => s.focus);
  const showEnums = useGraphLayoutStore((s) => s.graphLayout.showEnums);
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
    const hiddenLocalEnums = new Set<string>();
    for (const t of schema.types) {
      if (!showEnums && t.kind === 'enum') {
        hiddenLocalEnums.add(t.name);
        continue;
      }
      if (t.name.toLowerCase().includes(q)) {
        matches.push({
          name: t.name,
          focusName: t.name,
          matchType: 'name',
          kindLabel: kindLabel(t),
        });
      } else if (t.description?.toLowerCase().includes(q)) {
        matches.push({
          name: t.name,
          focusName: t.name,
          matchType: 'description',
          kindLabel: kindLabel(t),
        });
      }
    }
    if (!showEnums && hiddenLocalEnums.size > 0) {
      for (const type of schema.types) {
        if (type.kind !== 'object') continue;
        for (const field of type.fields) {
          const target = unwrapRefTarget(field.type);
          if (!target || !hiddenLocalEnums.has(target)) continue;
          if (target.toLowerCase().includes(q)) {
            matches.push({
              name: target,
              focusName: type.name,
              matchType: 'enum',
              kindLabel: 'enum',
              focusFieldName: field.name,
              detail: `${type.name}.${field.name}`,
            });
          }
        }
      }
    }
    return matches.slice(0, 10);
  }, [query, schema, showEnums]);

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

  function pick(result: Result): void {
    focus({ nodeId: result.focusName, fieldName: result.focusFieldName });
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
      pick(results[activeIndex]);
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
          placeholder="Search types and enums…"
          className="flex-1 min-w-0 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/50"
          aria-label="Search types and enums"
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
              key={`${r.name}-${r.focusName}-${r.detail ?? r.matchType}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              className={`flex w-full min-w-0 items-baseline gap-1.5 px-3 py-1.5 text-left text-xs transition-colors ${
                i === activeIndex
                  ? 'bg-secondary text-foreground'
                  : 'text-foreground hover:bg-secondary/60'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span
                className="shrink-0 rounded border px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide"
                style={KIND_BADGE_STYLES[r.kindLabel]}
                title={r.detail}
              >
                {r.kindLabel}
              </span>
              {r.matchType === 'description' && (
                <span className="shrink min-w-0 truncate text-muted-foreground/60">
                  (in description)
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function unwrapRefTarget(t: FieldType): string | undefined {
  let cur: FieldType = t;
  while (cur.kind === 'array' && cur.element) cur = cur.element as typeof cur;
  return cur.kind === 'ref' ? cur.typeName : undefined;
}

function kindLabel(type: {
  kind: 'object' | 'enum' | 'discriminatedUnion' | 'raw';
  table?: boolean;
}): Result['kindLabel'] {
  if (type.kind === 'object') return type.table ? 'table' : 'object';
  if (type.kind === 'discriminatedUnion') return 'union';
  return type.kind;
}

function badgeStyle(color: string): CSSProperties {
  return {
    background: `color-mix(in oklch, ${color} 12%, transparent)`,
    borderColor: `color-mix(in oklch, ${color} 42%, var(--border))`,
    color: `color-mix(in oklch, ${color} 70%, var(--foreground))`,
  };
}
