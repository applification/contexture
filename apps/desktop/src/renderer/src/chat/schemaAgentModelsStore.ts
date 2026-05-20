import { create } from 'zustand';
import type { SchemaAgentProvider } from '../store/schema-agent-settings';

export type SchemaAgentModelOptionDescriptor =
  | {
      id: string;
      type: 'select';
      label: string;
      options: Array<{ id: string; label: string; isDefault?: boolean }>;
      currentValue?: string;
    }
  | {
      id: string;
      type: 'boolean';
      label: string;
      defaultValue?: boolean;
      currentValue?: boolean;
    };

export interface SchemaAgentModelInfo {
  id: string;
  label: string;
  supportsReasoningEffort?: boolean;
  optionDescriptors?: SchemaAgentModelOptionDescriptor[];
}

export type SchemaAgentModelListState = 'idle' | 'loading' | 'loaded' | 'error';

interface SchemaAgentModelsState {
  provider: SchemaAgentProvider | null;
  models: SchemaAgentModelInfo[];
  status: SchemaAgentModelListState;
  beginLoading: (provider: SchemaAgentProvider) => void;
  acceptLoaded: (provider: SchemaAgentProvider, models: SchemaAgentModelInfo[]) => void;
  failLoading: (provider: SchemaAgentProvider) => void;
  reset: () => void;
}

const initialState = {
  provider: null,
  models: [],
  status: 'idle' as const,
};

export const useSchemaAgentModelsStore = create<SchemaAgentModelsState>((set, get) => ({
  ...initialState,

  beginLoading(provider) {
    const state = get();
    if (state.provider === provider && state.status === 'loaded') return;
    set({ provider, models: [], status: 'loading' });
  },

  acceptLoaded(provider, models) {
    set({ provider, models, status: 'loaded' });
  },

  failLoading(provider) {
    set({ provider, models: [], status: 'error' });
  },

  reset() {
    set(initialState);
  },
}));
