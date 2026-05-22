import type { ModelChangeLogEntry, ModelChangeSource } from '@contexture/core';
import { create } from 'zustand';

export type ChangeSourceFilter = 'all' | ModelChangeSource | 'agent';

interface ChangeLogLoadResult {
  entries: ModelChangeLogEntry[];
  warnings: string[];
  error: null;
}

interface ChangesState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: ModelChangeLogEntry[];
  warnings: string[];
  error: string | null;
  query: string;
  sourceFilter: ChangeSourceFilter;
  currentSelectionOnly: boolean;
  selectedId: string | null;

  load: (input: { irPath: string; api: NonNullable<Window['contexture']['modelSync']> }) => void;
  recordEntry: (entry: ModelChangeLogEntry) => void;
  resetForNoDocument: () => void;
  setQuery: (query: string) => void;
  setSourceFilter: (sourceFilter: ChangeSourceFilter) => void;
  setCurrentSelectionOnly: (currentSelectionOnly: boolean) => void;
  select: (selectedId: string | null) => void;
}

export const useChangesStore = create<ChangesState>((set, get) => ({
  status: 'idle',
  entries: [],
  warnings: [],
  error: null,
  query: '',
  sourceFilter: 'all',
  currentSelectionOnly: false,
  selectedId: null,

  load: ({ irPath, api }) => {
    set({ status: 'loading', error: null });
    void api
      .getChangeLog({ irPath })
      .then((result) => {
        const parsed = parseChangeLogLoadResult(result);
        const currentSelectedId = get().selectedId;
        const selectedStillExists = parsed.entries.some((entry) => entry.id === currentSelectedId);
        set({
          status: 'ready',
          ...parsed,
          selectedId: selectedStillExists ? currentSelectedId : (parsed.entries[0]?.id ?? null),
        });
      })
      .catch((err) => {
        set({
          status: 'error',
          entries: [],
          warnings: [],
          error: err instanceof Error ? err.message : String(err),
          selectedId: null,
        });
      });
  },
  recordEntry: (entry) =>
    set((state) => ({
      status: state.status === 'idle' ? 'ready' : state.status,
      entries: [entry, ...state.entries.filter((existing) => existing.id !== entry.id)],
      error: null,
      selectedId: state.selectedId ?? entry.id,
    })),
  resetForNoDocument: () =>
    set({
      status: 'ready',
      entries: [],
      warnings: [],
      error: null,
      selectedId: null,
    }),
  setQuery: (query) => set({ query }),
  setSourceFilter: (sourceFilter) => set({ sourceFilter }),
  setCurrentSelectionOnly: (currentSelectionOnly) => set({ currentSelectionOnly }),
  select: (selectedId) => set({ selectedId }),
}));

function parseChangeLogLoadResult(value: unknown): ChangeLogLoadResult {
  if (!value || typeof value !== 'object') return { entries: [], warnings: [], error: null };
  const record = value as {
    log?: { entries?: unknown };
    warnings?: unknown;
  };
  const entries = Array.isArray(record.log?.entries)
    ? record.log.entries.filter(isChangeLogEntry)
    : [];
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
  return { entries, warnings, error: null };
}

function isChangeLogEntry(value: unknown): value is ModelChangeLogEntry {
  return !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string';
}

export function changeLogEntryFromAppendResult(value: unknown): ModelChangeLogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = (value as { entry?: unknown }).entry;
  return isChangeLogEntry(entry) ? entry : null;
}
