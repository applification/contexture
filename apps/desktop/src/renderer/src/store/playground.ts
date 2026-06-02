import { create } from 'zustand';

export interface PlaygroundRecord {
  id: string;
  typeName: string;
  value: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface PlaygroundStoreShape {
  selectedTypeName: string | null;
  selectedRecordId: string | null;
  recordsByType: Record<string, PlaygroundRecord[]>;
  activeScopeId: string;
  recordsByScope: Record<string, Record<string, PlaygroundRecord[]>>;

  setScope(scopeId: string, typeNames?: readonly string[]): void;
  selectType(typeName: string | null): void;
  selectRecord(typeName: string, recordId: string | null): void;
  upsertRecord(typeName: string, recordId: string | null, value: Record<string, unknown>): string;
  insertRecords(
    recordsByType: Record<string, Array<{ id: string; value: Record<string, unknown> }>>,
    mode?: 'append' | 'replace',
  ): void;
  deleteRecord(typeName: string, recordId: string): void;
  clearType(typeName: string): void;
  clearAll(): void;
  pruneTypes(typeNames: readonly string[]): void;
}

export const usePlaygroundStore = create<PlaygroundStoreShape>((set, get) => ({
  selectedTypeName: null,
  selectedRecordId: null,
  recordsByType: {},
  activeScopeId: 'default',
  recordsByScope: { default: {} },

  setScope: (scopeId, typeNames) => {
    const currentScopeId = get().activeScopeId;
    set((state) => {
      const recordsByScope = {
        ...state.recordsByScope,
        [currentScopeId]: state.recordsByType,
      };
      let recordsByType = recordsByScope[scopeId] ?? {};
      if (typeNames) {
        recordsByType = pruneRecordsByType(recordsByType, typeNames);
      }
      recordsByScope[scopeId] = recordsByType;
      const selectedTypeName =
        state.selectedTypeName && (!typeNames || typeNames.includes(state.selectedTypeName))
          ? state.selectedTypeName
          : null;
      return {
        activeScopeId: scopeId,
        recordsByScope,
        recordsByType,
        selectedTypeName,
        selectedRecordId: selectedTypeName
          ? selectedRecordIdFor(recordsByType[selectedTypeName] ?? [], state.selectedRecordId)
          : null,
      };
    });
  },

  selectType: (typeName) => {
    const records = typeName ? (get().recordsByType[typeName] ?? []) : [];
    set({
      selectedTypeName: typeName,
      selectedRecordId: records[0]?.id ?? null,
    });
  },

  selectRecord: (typeName, recordId) => {
    set({ selectedTypeName: typeName, selectedRecordId: recordId });
  },

  upsertRecord: (typeName, recordId, value) => {
    const now = Date.now();
    const id = recordId ?? crypto.randomUUID();
    const records = get().recordsByType[typeName] ?? [];
    const existing = records.find((record) => record.id === id);
    const nextRecord: PlaygroundRecord = {
      id,
      typeName,
      value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const nextRecords = existing
      ? records.map((record) => (record.id === id ? nextRecord : record))
      : [nextRecord, ...records];

    set((state) => ({
      recordsByType: { ...state.recordsByType, [typeName]: nextRecords },
      recordsByScope: {
        ...state.recordsByScope,
        [state.activeScopeId]: { ...state.recordsByType, [typeName]: nextRecords },
      },
      selectedTypeName: typeName,
      selectedRecordId: id,
    }));
    return id;
  },

  insertRecords: (incoming, mode = 'append') => {
    const now = Date.now();
    const nextRecordsByType = Object.fromEntries(
      Object.entries(incoming).map(([typeName, records]) => [
        typeName,
        records.map((record) => ({
          id: record.id,
          typeName,
          value: record.value,
          createdAt: now,
          updatedAt: now,
        })),
      ]),
    );

    set((state) => {
      const recordsByType = { ...state.recordsByType };
      for (const [typeName, records] of Object.entries(nextRecordsByType)) {
        recordsByType[typeName] =
          mode === 'replace' ? records : [...records, ...(recordsByType[typeName] ?? [])];
      }
      const selectedTypeName = state.selectedTypeName ?? Object.keys(nextRecordsByType)[0] ?? null;
      return {
        recordsByType,
        recordsByScope: { ...state.recordsByScope, [state.activeScopeId]: recordsByType },
        selectedTypeName,
        selectedRecordId: selectedTypeName
          ? (recordsByType[selectedTypeName]?.[0]?.id ?? null)
          : null,
      };
    });
  },

  deleteRecord: (typeName, recordId) => {
    const records = get().recordsByType[typeName] ?? [];
    const nextRecords = records.filter((record) => record.id !== recordId);
    set((state) => ({
      recordsByType: { ...state.recordsByType, [typeName]: nextRecords },
      recordsByScope: {
        ...state.recordsByScope,
        [state.activeScopeId]: { ...state.recordsByType, [typeName]: nextRecords },
      },
      selectedTypeName: typeName,
      selectedRecordId:
        state.selectedRecordId === recordId ? (nextRecords[0]?.id ?? null) : state.selectedRecordId,
    }));
  },

  clearType: (typeName) => {
    set((state) => ({
      recordsByType: { ...state.recordsByType, [typeName]: [] },
      recordsByScope: {
        ...state.recordsByScope,
        [state.activeScopeId]: { ...state.recordsByType, [typeName]: [] },
      },
      selectedRecordId: state.selectedTypeName === typeName ? null : state.selectedRecordId,
    }));
  },

  clearAll: () =>
    set((state) => ({
      recordsByType: {},
      recordsByScope: { ...state.recordsByScope, [state.activeScopeId]: {} },
      selectedRecordId: null,
    })),

  pruneTypes: (typeNames) => {
    set((state) => {
      const recordsByType = pruneRecordsByType(state.recordsByType, typeNames);
      const selectedTypeName =
        state.selectedTypeName && typeNames.includes(state.selectedTypeName)
          ? state.selectedTypeName
          : null;
      return {
        recordsByType,
        recordsByScope: { ...state.recordsByScope, [state.activeScopeId]: recordsByType },
        selectedTypeName,
        selectedRecordId: selectedTypeName
          ? selectedRecordIdFor(recordsByType[selectedTypeName] ?? [], state.selectedRecordId)
          : null,
      };
    });
  },
}));

function selectedRecordIdFor(
  records: readonly PlaygroundRecord[],
  currentRecordId: string | null,
): string | null {
  if (currentRecordId && records.some((record) => record.id === currentRecordId)) {
    return currentRecordId;
  }
  return records[0]?.id ?? null;
}

function pruneRecordsByType(
  recordsByType: Record<string, PlaygroundRecord[]>,
  typeNames: readonly string[],
): Record<string, PlaygroundRecord[]> {
  const allowed = new Set(typeNames);
  const next: Record<string, PlaygroundRecord[]> = {};
  for (const [typeName, records] of Object.entries(recordsByType)) {
    if (allowed.has(typeName)) next[typeName] = records;
  }
  return next;
}
