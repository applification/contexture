import { create } from 'zustand';

export type SchemaAgentProvider = 'codex' | 'claude';
export type SchemaAgentModelOptions = Record<string, string | boolean>;

export interface SchemaAgentModelSettings {
  provider?: SchemaAgentProvider;
  model?: string;
  effort?: string;
  modelOptions?: SchemaAgentModelOptions;
}

interface SchemaAgentSettingsState {
  provider: SchemaAgentProvider;
  model: string;
  effort: string;
  modelOptions: SchemaAgentModelOptions;
  setProvider: (provider: SchemaAgentProvider) => void;
  restoreSettings: (settings: SchemaAgentModelSettings) => void;
  setModel: (model: string) => void;
  setEffort: (effort: string) => void;
  setModelOptions: (options: SchemaAgentModelOptions) => void;
  setModelOption: (id: string, value: string | boolean) => void;
  reloadFromStorage: () => void;
}

export const SCHEMA_AGENT_PROVIDER_STORAGE_KEY = 'contexture-schema-agent-provider';

export const useSchemaAgentSettingsStore = create<SchemaAgentSettingsState>((set, get) => {
  const provider = readStoredProvider();
  return {
    provider,
    model: readStoredModel(provider),
    effort: readStoredEffort(provider),
    modelOptions: readStoredModelOptions(provider),

    setProvider(next) {
      persistProvider(next);
      set({
        provider: next,
        model: readStoredModel(next),
        effort: readStoredEffort(next),
        modelOptions: readStoredModelOptions(next),
      });
    },

    restoreSettings(settings) {
      const nextProvider = settings.provider ?? get().provider;
      const nextModel =
        settings.model !== undefined ? settings.model : readStoredModel(nextProvider);
      const nextEffort = normalizeEffort(
        nextProvider,
        settings.effort ?? localStorage.getItem(effortStorageKey(nextProvider)),
      );
      const nextOptions = settings.modelOptions ?? readStoredModelOptions(nextProvider);

      persistProvider(nextProvider);
      persistModel(nextProvider, nextModel);
      persistEffort(nextProvider, nextEffort);
      persistModelOptions(nextProvider, nextOptions);
      set({
        provider: nextProvider,
        model: nextModel,
        effort: nextEffort,
        modelOptions: nextOptions,
      });
    },

    setModel(model) {
      const provider = get().provider;
      persistModel(provider, model);
      set({ model });
    },

    setEffort(effort) {
      const provider = get().provider;
      persistEffort(provider, effort);
      set({ effort });
    },

    setModelOptions(modelOptions) {
      const provider = get().provider;
      persistModelOptions(provider, modelOptions);
      set({ modelOptions });
    },

    setModelOption(id, value) {
      const provider = get().provider;
      const modelOptions = { ...get().modelOptions, [id]: value };
      persistModelOptions(provider, modelOptions);
      set({ modelOptions });
    },

    reloadFromStorage() {
      const nextProvider = readStoredProvider();
      set({
        provider: nextProvider,
        model: readStoredModel(nextProvider),
        effort: readStoredEffort(nextProvider),
        modelOptions: readStoredModelOptions(nextProvider),
      });
    },
  };
});

export function providerLabel(provider: SchemaAgentProvider): 'Codex' | 'Claude' {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

export function readStoredProvider(): SchemaAgentProvider {
  return localStorage.getItem(SCHEMA_AGENT_PROVIDER_STORAGE_KEY) === 'claude' ? 'claude' : 'codex';
}

export function modelStorageKey(provider: SchemaAgentProvider): string {
  return `contexture-schema-agent-${provider}-model`;
}

export function effortStorageKey(provider: SchemaAgentProvider): string {
  return `contexture-schema-agent-${provider}-effort`;
}

export function modelOptionsStorageKey(provider: SchemaAgentProvider): string {
  return `contexture-schema-agent-${provider}-model-options`;
}

export function readStoredModel(provider: SchemaAgentProvider): string {
  return localStorage.getItem(modelStorageKey(provider)) ?? '';
}

export function readStoredModelOptions(provider: SchemaAgentProvider): SchemaAgentModelOptions {
  try {
    const raw = localStorage.getItem(modelOptionsStorageKey(provider));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string | boolean] =>
          typeof entry[1] === 'string' || typeof entry[1] === 'boolean',
      ),
    );
  } catch {
    return {};
  }
}

export function readStoredEffort(provider: SchemaAgentProvider): string {
  return normalizeEffort(provider, localStorage.getItem(effortStorageKey(provider)));
}

export function normalizeEffort(provider: SchemaAgentProvider, effort: unknown): string {
  if (provider === 'codex') {
    if (effort === 'med') return 'medium';
    if (effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh') {
      return effort;
    }
    return 'high';
  }
  if (effort === 'medium') return 'med';
  if (
    effort === 'auto' ||
    effort === 'low' ||
    effort === 'med' ||
    effort === 'high' ||
    effort === 'xhigh'
  ) {
    return effort;
  }
  return 'auto';
}

function persistProvider(provider: SchemaAgentProvider): void {
  localStorage.setItem(SCHEMA_AGENT_PROVIDER_STORAGE_KEY, provider);
}

function persistModel(provider: SchemaAgentProvider, model: string): void {
  localStorage.setItem(modelStorageKey(provider), model);
}

function persistEffort(provider: SchemaAgentProvider, effort: string): void {
  localStorage.setItem(effortStorageKey(provider), effort);
}

function persistModelOptions(
  provider: SchemaAgentProvider,
  options: SchemaAgentModelOptions,
): void {
  localStorage.setItem(modelOptionsStorageKey(provider), JSON.stringify(options));
}
