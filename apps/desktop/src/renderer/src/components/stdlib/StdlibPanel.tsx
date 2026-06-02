import type { FieldType, Schema } from '@contexture/core/ir';
import { STDLIB_TYPE_OPTIONS } from '@shared/stdlib-registry';
import { BookOpen, Search, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface StdlibPanelProps {
  schema: Schema;
  focusedTypeName?: string;
}

export function StdlibPanel({ schema, focusedTypeName }: StdlibPanelProps): React.JSX.Element {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const focusedRef = useRef<HTMLElement | null>(null);
  const usageByType = useMemo(() => stdlibUsageByType(schema), [schema]);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byNamespace = new Map<string, typeof STDLIB_TYPE_OPTIONS>();
    for (const option of STDLIB_TYPE_OPTIONS) {
      const searchable =
        `${option.qualifiedName} ${option.description} ${option.example}`.toLowerCase();
      if (q && !searchable.includes(q)) continue;
      byNamespace.set(option.namespace, [...(byNamespace.get(option.namespace) ?? []), option]);
    }
    return [...byNamespace.entries()];
  }, [query]);

  useEffect(() => {
    if (!focusedTypeName) return;
    setQuery(focusedTypeName);
  }, [focusedTypeName]);

  useEffect(() => {
    if (!focusedTypeName) return;
    if (query.trim() !== focusedTypeName) return;
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusedTypeName, query]);

  const clearSearch = (): void => setQuery('');
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return;
    if (!query) return;
    event.preventDefault();
    event.stopPropagation();
    clearSearch();
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Stdlib">
      <header className="border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md border bg-primary/10 text-primary">
            <BookOpen className="size-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Stdlib</h2>
            <p className="text-xs text-muted-foreground">Reusable value types for fields.</p>
          </div>
        </div>
        <label htmlFor={searchId} className="relative mt-3 block">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            type="search"
            aria-label="Search stdlib"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search Email, ISODate, CountryCode..."
            className="h-8 pl-7 pr-8 text-xs [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear stdlib search"
              className="absolute right-1 top-1/2 size-6 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground"
              onClick={clearSearch}
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </label>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No stdlib types match this search.</p>
        ) : (
          groups.map(([namespace, options]) => (
            <section key={namespace} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase text-muted-foreground">{namespace}</h3>
                <Badge variant="outline">{options.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {options.map((option) => {
                  const usages = usageByType.get(option.qualifiedName) ?? [];
                  const jsonExample = parseJsonExample(option.example);
                  return (
                    <article
                      key={option.qualifiedName}
                      ref={option.qualifiedName === focusedTypeName ? focusedRef : undefined}
                      className={
                        option.qualifiedName === focusedTypeName
                          ? 'rounded-md border border-primary/70 bg-primary/10 p-2 text-xs'
                          : 'rounded-md border bg-muted/15 p-2 text-xs'
                      }
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[11px] text-foreground">
                            {option.qualifiedName}
                          </div>
                          <p className="mt-1 leading-5 text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                        {option.example && !jsonExample && (
                          <Badge
                            variant="secondary"
                            className="min-w-0 max-w-[min(24rem,52vw)] overflow-hidden px-2"
                          >
                            <span className="block min-w-0 truncate">{option.example}</span>
                          </Badge>
                        )}
                        {jsonExample && <JsonExample value={jsonExample} />}
                      </div>
                      {usages.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {usages.map((usage) => (
                            <Badge
                              key={usage}
                              variant="outline"
                              className="min-w-0 max-w-full px-2 font-mono text-[10px]"
                            >
                              <span className="min-w-0 truncate">{usage}</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

function stdlibUsageByType(schema: Schema): Map<string, string[]> {
  const usages = new Map<string, string[]>();
  for (const type of schema.types) {
    if (type.kind !== 'object') continue;
    for (const field of type.fields) {
      const target = unwrapRefTarget(field.type);
      if (!target?.includes('.')) continue;
      const entries = usages.get(target) ?? [];
      entries.push(`${type.name}.${field.name}`);
      usages.set(target, entries);
    }
  }
  return usages;
}

function unwrapRefTarget(type: FieldType): string | undefined {
  let current = type;
  while (current.kind === 'array') current = current.element;
  return current.kind === 'ref' ? current.typeName : undefined;
}

function parseJsonExample(example: string): string | null {
  const trimmed = example.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function JsonExample({ value }: { value: string }): React.JSX.Element {
  return (
    <pre className="max-h-24 max-w-[min(20rem,45vw)] overflow-auto rounded-lg border border-border/80 bg-secondary/45 px-2.5 py-1.5 font-mono text-[10px] leading-4 shadow-inner">
      {jsonLines(value).map(({ key, line }) => (
        <span key={key} className="block">
          {renderJsonLine(line)}
        </span>
      ))}
    </pre>
  );
}

function renderJsonLine(line: string): React.ReactNode[] {
  return jsonTokens(line).map(({ key, token }) => {
    if (/^"(?:[^"\\]|\\.)*"\s*:$/u.test(token)) {
      return (
        <span key={key} className="text-primary">
          {token}
        </span>
      );
    }
    if (/^"(?:[^"\\]|\\.)*"$/u.test(token)) {
      return (
        <span key={key} className="text-foreground">
          {token}
        </span>
      );
    }
    if (/^[{}[\],:]$/u.test(token)) {
      return (
        <span key={key} className="text-muted-foreground/70">
          {token}
        </span>
      );
    }
    return (
      <span key={key} className="text-muted-foreground">
        {token}
      </span>
    );
  });
}

function jsonLines(value: string): { key: string; line: string }[] {
  const lines: { key: string; line: string }[] = [];
  let offset = 0;
  for (const line of value.split('\n')) {
    lines.push({ key: `line-${offset}`, line });
    offset += line.length + 1;
  }
  return lines;
}

function jsonTokens(line: string): { key: string; token: string }[] {
  const pieces = line
    .split(/("(?:[^"\\]|\\.)*"\s*:|"(?:[^"\\]|\\.)*"|[{}[\],:])/gu)
    .filter(Boolean);
  const tokens: { key: string; token: string }[] = [];
  let offset = 0;
  for (const token of pieces) {
    const start = line.indexOf(token, offset);
    tokens.push({ key: `token-${start}`, token });
    offset = start + token.length;
  }
  return tokens;
}
