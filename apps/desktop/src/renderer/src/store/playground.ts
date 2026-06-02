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
      selectedTypeName: typeName,
      selectedRecordId:
        state.selectedRecordId === recordId ? (nextRecords[0]?.id ?? null) : state.selectedRecordId,
    }));
  },

  clearType: (typeName) => {
    set((state) => ({
      recordsByType: { ...state.recordsByType, [typeName]: [] },
      selectedRecordId: state.selectedTypeName === typeName ? null : state.selectedRecordId,
    }));
  },

  clearAll: () => set({ recordsByType: {}, selectedRecordId: null }),

  pruneTypes: (typeNames) => {
    const allowed = new Set(typeNames);
    set((state) => {
      const recordsByType: Record<string, PlaygroundRecord[]> = {};
      for (const [typeName, records] of Object.entries(state.recordsByType)) {
        if (allowed.has(typeName)) recordsByType[typeName] = records;
      }
      const selectedTypeName =
        state.selectedTypeName && allowed.has(state.selectedTypeName)
          ? state.selectedTypeName
          : null;
      return {
        recordsByType,
        selectedTypeName,
        selectedRecordId: selectedTypeName ? state.selectedRecordId : null,
      };
    });
  },
}));
