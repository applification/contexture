import type { ModelChangeLogEntry } from '@contexture/core';
import { AlertTriangle, History, LocateFixed, Search } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { type ChangeSourceFilter, useChangesStore } from '../../store/changes';
import { useDocumentStore } from '../../store/document';
import { sourceLabel } from '../../store/model-sync';
import { useGraphSelectionStore } from '../../store/selection';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const SOURCE_FILTERS: Array<{ value: ChangeSourceFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'agent', label: 'Agent' },
  { value: 'mcp', label: 'MCP' },
  { value: 'cli', label: 'CLI' },
  { value: 'reconcile', label: 'Reconcile' },
  { value: 'external', label: 'External' },
];

export function ChangesPanel(): React.JSX.Element {
  const filePath = useDocumentStore((s) => s.filePath);
  const selectedNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
  const focus = useGraphSelectionStore((s) => s.focus);
  const click = useGraphSelectionStore((s) => s.click);
  const status = useChangesStore((s) => s.status);
  const entries = useChangesStore((s) => s.entries);
  const warnings = useChangesStore((s) => s.warnings);
  const error = useChangesStore((s) => s.error);
  const query = useChangesStore((s) => s.query);
  const sourceFilter = useChangesStore((s) => s.sourceFilter);
  const currentSelectionOnly = useChangesStore((s) => s.currentSelectionOnly);
  const selectedId = useChangesStore((s) => s.selectedId);
  const load = useChangesStore((s) => s.load);
  const resetForNoDocument = useChangesStore((s) => s.resetForNoDocument);
  const setQuery = useChangesStore((s) => s.setQuery);
  const setSourceFilter = useChangesStore((s) => s.setSourceFilter);
  const setCurrentSelectionOnly = useChangesStore((s) => s.setCurrentSelectionOnly);
  const selectChange = useChangesStore((s) => s.select);

  useEffect(() => {
    if (!filePath || !window.contexture?.modelSync) {
      resetForNoDocument();
      return;
    }
    load({ irPath: filePath, api: window.contexture.modelSync });
  }, [filePath, load, resetForNoDocument]);

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (sourceFilter === 'agent') {
          if (entry.source !== 'schema_agent' && entry.source !== 'mcp') return false;
        } else if (sourceFilter !== 'all' && entry.source !== sourceFilter) {
          return false;
        }
        if (currentSelectionOnly && selectedNodeId) {
          if (!entryTouchesType(entry, selectedNodeId)) return false;
        }
        const haystack = [
          entry.summary,
          entry.actor,
          entry.opKind,
          sourceLabel(entry.source),
          ...entry.addedTypes,
          ...entry.changedTypes,
          ...entry.removedTypes,
          ...entry.renamedTypes.flatMap((rename) => [rename.from, rename.to]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      }),
    [currentSelectionOnly, entries, query, selectedNodeId, sourceFilter],
  );

  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;

  function focusAffected(entry: ModelChangeLogEntry): void {
    const target = primaryAffectedType(entry);
    if (!target) return;
    click(target, 'replace');
    focus(target);
  }

  if (status === 'error') {
    return (
      <PanelEmpty
        icon={<AlertTriangle />}
        title="Change log unavailable"
        description={
          error ??
          'Contexture could not read .contexture/change-log.json. The model is still usable.'
        }
      />
    );
  }

  if (!filePath) {
    return (
      <PanelEmpty
        icon={<History />}
        title="No model changes yet"
        description="Changes to this Contexture model will appear here after the file is saved."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Model changes</h2>
          {status === 'loading' && (
            <span className="text-[10px] text-muted-foreground">Loading...</span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search changes"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={sourceFilter}
            onValueChange={(value) => setSourceFilter(value as ChangeSourceFilter)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue aria-label="Source" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_FILTERS.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedNodeId && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                id="changes-current-selection"
                checked={currentSelectionOnly}
                onCheckedChange={(checked) => setCurrentSelectionOnly(checked === true)}
              />
              <label htmlFor="changes-current-selection">Current selection</label>
            </div>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <PanelEmpty
          icon={<History />}
          title="No model changes yet"
          description="Changes to this Contexture model will appear here after the file is edited, reconciled, or updated by an agent."
        />
      ) : filtered.length === 0 ? (
        <PanelEmpty
          icon={<Search />}
          title="No matching changes"
          description="Adjust the search or filters."
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
          <div className="min-h-0 overflow-y-auto border-b border-border">
            {warnings.length > 0 && (
              <div className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                {warnings[0]}
              </div>
            )}
            {filtered.map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => selectChange(entry.id)}
                className={`w-full border-b border-border px-3 py-2 text-left text-xs hover:bg-muted/60 ${
                  selected?.id === entry.id ? 'bg-muted' : ''
                }`}
              >
                <div className="font-medium text-foreground">{entryTitle(entry)}</div>
                <div className="mt-0.5 truncate text-muted-foreground">
                  {sourceLabel(entry.source)}
                  {entry.actor ? ` · ${entry.actor}` : ''}
                  {' · '}
                  <time title={entry.createdAt}>{timeLabel(entry.createdAt)}</time>
                  {' · '}
                  {entry.changeCount} {entry.changeCount === 1 ? 'affected type' : 'affected types'}
                </div>
                {entry.summary && (
                  <div className="mt-1 truncate text-muted-foreground/80">{entry.summary}</div>
                )}
              </button>
            ))}
          </div>

          {selected && (
            <div className="max-h-80 overflow-y-auto p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-foreground">{entryTitle(selected)}</div>
                  <div className="mt-0.5 text-muted-foreground">
                    {sourceLabel(selected.source)} ·{' '}
                    <time title={selected.createdAt}>{timeLabel(selected.createdAt)}</time>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => focusAffected(selected)}
                  disabled={!primaryAffectedType(selected)}
                >
                  <LocateFixed className="size-3" />
                  Focus affected
                </Button>
              </div>

              <section className="mt-3 space-y-1.5">
                <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Affected model
                </h3>
                <div className="flex flex-wrap gap-1">
                  {affectedTypes(selected).map((typeName) => (
                    <button
                      type="button"
                      key={typeName}
                      onClick={() => {
                        click(typeName, 'replace');
                        focus(typeName);
                      }}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                    >
                      {typeName}
                    </button>
                  ))}
                </div>
              </section>

              <section className="mt-3 space-y-1">
                <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Change summary
                </h3>
                <p className="text-muted-foreground">{selected.summary ?? 'Model changed'}</p>
                <p className="text-muted-foreground/70">
                  Generated file drift is handled in Reconcile.
                </p>
              </section>

              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Raw log entry
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 text-[10px]">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PanelEmpty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <Empty className="h-full border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle className="text-sm font-medium">{title}</EmptyTitle>
        <EmptyDescription className="text-xs">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function entryTitle(entry: ModelChangeLogEntry): string {
  const affected = primaryAffectedType(entry);
  return `${operationLabel(entry)}${affected ? ` · ${affected}` : ''}`;
}

function operationLabel(entry: ModelChangeLogEntry): string {
  if (entry.renamedTypes.length > 0) return 'Renamed';
  if (entry.addedTypes.length > 0) return 'Added';
  if (entry.removedTypes.length > 0) return 'Deleted';
  if (entry.reason === 'external_sync_accepted') return 'Accepted external change';
  if (entry.reason === 'replace_schema') return 'Replaced';
  return 'Updated';
}

function affectedTypes(entry: ModelChangeLogEntry): string[] {
  return [
    ...entry.addedTypes,
    ...entry.changedTypes,
    ...entry.removedTypes,
    ...entry.renamedTypes.flatMap((rename) => [rename.from, rename.to]),
  ];
}

function primaryAffectedType(entry: ModelChangeLogEntry): string | null {
  return affectedTypes(entry)[0] ?? null;
}

function entryTouchesType(entry: ModelChangeLogEntry, typeName: string): boolean {
  return affectedTypes(entry).includes(typeName);
}

function timeLabel(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
