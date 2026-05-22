import type { ModelChangeLogEntry, ModelChangeSource, ModelChangeSummary } from '@contexture/core';
import { create } from 'zustand';

export type ModelSyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'external_changes'
  | 'model_conflict'
  | 'invalid_model';

export interface RendererModelSyncEvent {
  irPath: string;
  status: 'changed' | 'invalid_json' | 'invalid_ir' | 'unreadable' | 'deleted';
  source: ModelChangeSource | 'unknown';
  observedAt: number;
  revision: string;
  content?: string;
  schema?: unknown;
  error?: string;
  change?: ModelChangeLogEntry;
}

export interface ModelSyncNotice {
  source: ModelChangeSource | 'unknown';
  changeCount: number;
  changedTypes: string[];
  addedTypes: string[];
  removedTypes: string[];
  renamedTypes: Array<{ from: string; to: string }>;
  summary: string;
  observedAt: number;
}

interface ModelSyncState {
  status: ModelSyncStatus;
  notice: ModelSyncNotice | null;
  pendingEvent: RendererModelSyncEvent | null;
  invalidEvent: RendererModelSyncEvent | null;
  highlightedNodeIds: string[];

  setSyncing: () => void;
  setSynced: (notice: ModelSyncNotice, highlightedNodeIds: string[]) => void;
  setPending: (event: RendererModelSyncEvent, notice: ModelSyncNotice) => void;
  setInvalid: (event: RendererModelSyncEvent) => void;
  clearAttention: () => void;
  clearHighlights: () => void;
}

export const useModelSyncStore = create<ModelSyncState>((set) => ({
  status: 'idle',
  notice: null,
  pendingEvent: null,
  invalidEvent: null,
  highlightedNodeIds: [],

  setSyncing: () => set({ status: 'syncing' }),
  setSynced: (notice, highlightedNodeIds) =>
    set({
      status: 'synced',
      notice,
      pendingEvent: null,
      invalidEvent: null,
      highlightedNodeIds,
    }),
  setPending: (pendingEvent, notice) =>
    set({
      status: 'external_changes',
      notice,
      pendingEvent,
      invalidEvent: null,
      highlightedNodeIds: [],
    }),
  setInvalid: (invalidEvent) =>
    set({
      status: 'invalid_model',
      pendingEvent: null,
      invalidEvent,
      highlightedNodeIds: [],
    }),
  clearAttention: () =>
    set({
      status: 'idle',
      notice: null,
      pendingEvent: null,
      invalidEvent: null,
      highlightedNodeIds: [],
    }),
  clearHighlights: () => set({ highlightedNodeIds: [] }),
}));

export function noticeFromSummary(
  source: ModelChangeSource | 'unknown',
  observedAt: number,
  summary: ModelChangeSummary,
): ModelSyncNotice {
  return {
    source,
    observedAt,
    changedTypes: summary.changedTypes,
    addedTypes: summary.addedTypes,
    removedTypes: summary.removedTypes,
    renamedTypes: summary.renamedTypes,
    changeCount: summary.changeCount,
    summary: summary.summary,
  };
}

export function noticeFromChange(change: ModelChangeLogEntry): ModelSyncNotice {
  return {
    source: change.source,
    observedAt: Date.parse(change.createdAt),
    changedTypes: change.changedTypes,
    addedTypes: change.addedTypes,
    removedTypes: change.removedTypes,
    renamedTypes: change.renamedTypes,
    changeCount: change.changeCount,
    summary: change.summary ?? 'Model changed',
  };
}

export function sourceLabel(source: ModelChangeSource | 'unknown'): string {
  switch (source) {
    case 'desktop':
      return 'Desktop';
    case 'schema_agent':
      return 'Schema agent';
    case 'mcp':
      return 'MCP';
    case 'cli':
      return 'CLI';
    case 'reconcile':
      return 'Reconcile';
    case 'external':
      return 'External';
    case 'unknown':
      return 'External';
  }
}

export function affectedNodeIds(notice: ModelSyncNotice): string[] {
  return [
    ...notice.addedTypes,
    ...notice.changedTypes,
    ...notice.renamedTypes.map((rename) => rename.to),
  ];
}
