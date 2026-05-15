import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ContextureSchemaAgentAPI } from '../../../preload/index.d';
import type { ChatMessage, ChatRole } from '../model/chat-history';
import { useChatComposerStore } from '../store/chat-composer';
import type { ApplyResult, Op } from '../store/ops';
import { useUndoStore } from '../store/undo';
import { bindTurnToUndo, type IpcSubscriber } from './turn-binder';

export type SchemaAgentProvider = 'codex' | 'claude';
export const SCHEMA_AGENT_PROVIDER_CHANGED = 'contexture-schema-agent-provider-changed';
export type SchemaAgentModelOptions = Record<string, string | boolean>;

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

export interface SchemaAgentChatState {
  provider: SchemaAgentProvider;
  providerLabel: 'Codex' | 'Claude';
  setProvider: (provider: SchemaAgentProvider) => void;
  restoreSettings: (settings: SchemaAgentModelSettings) => void;
  models: SchemaAgentModelInfo[];
  modelsLoading: boolean;
  modelsUnavailable: boolean;
  model: string;
  setModel: (model: string) => void;
  modelOptions: SchemaAgentModelOptions;
  setModelOption: (id: string, value: string | boolean) => void;
  effort: string;
  setEffort: (effort: string) => void;
  messages: ChatMessage[];
  isStreaming: boolean;
  liveAssistant: string;
  authRequired: boolean;
  isReady: boolean;
  unavailableMessage: string | null;
  providerThreadRef: unknown;
  desynced: boolean;
  clearAuthRequired: () => void;
  send: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  hydrate: (messages: ChatMessage[]) => void;
  clear: () => void;
}

export interface SchemaAgentModelSettings {
  provider?: SchemaAgentProvider;
  model?: string;
  effort?: string;
  modelOptions?: SchemaAgentModelOptions;
}

export interface UseSchemaAgentChatOptions {
  api: ContextureSchemaAgentAPI;
  onMessagePersisted?: (message: ChatMessage) => void;
}

function mkId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function mkMessage(role: ChatRole, content: string): ChatMessage {
  return { id: mkId(), role, content, createdAt: Date.now() };
}

export function useSchemaAgentChat({
  api,
  onMessagePersisted,
}: UseSchemaAgentChatOptions): SchemaAgentChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [liveAssistant, setLiveAssistant] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [isReady, setReady] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [providerThreadRef, setProviderThreadRef] = useState<unknown>(undefined);
  const [desynced, setDesynced] = useState(false);
  const [provider, setProviderState] = useState<SchemaAgentProvider>(
    () =>
      (localStorage.getItem('contexture-schema-agent-provider') as SchemaAgentProvider | null) ??
      'codex',
  );
  const [models, setModels] = useState<SchemaAgentModelInfo[]>([]);
  const [modelsProvider, setModelsProvider] = useState<SchemaAgentProvider | null>(null);
  const [modelListState, setModelListState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
    'idle',
  );
  const [model, setModelState] = useState(
    () => localStorage.getItem(modelStorageKey(provider)) ?? '',
  );
  const [modelOptions, setModelOptionsState] = useState<SchemaAgentModelOptions>(() =>
    readStoredModelOptions(provider),
  );
  const [effort, setEffortState] = useState(() => readStoredEffort(provider));
  const providerRef = useRef(provider);
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const persistenceEnabled = useChatComposerStore((s) => s.chatHistoryPersistence);
  const assistantBufferRef = useRef('');
  const rafHandleRef = useRef<number | null>(null);

  const flushLiveAssistant = useCallback(() => {
    rafHandleRef.current = null;
    setLiveAssistant(assistantBufferRef.current);
  }, []);

  const scheduleLiveFlush = useCallback(() => {
    if (rafHandleRef.current !== null) return;
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) =>
            setTimeout(() => cb(performance.now()), 16) as unknown as number;
    rafHandleRef.current = -1;
    const handle = raf(flushLiveAssistant);
    if (rafHandleRef.current === -1) rafHandleRef.current = handle;
  }, [flushLiveAssistant]);

  const cancelLiveFlush = useCallback(() => {
    if (rafHandleRef.current === null) return;
    const caf =
      typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    caf(rafHandleRef.current);
    rafHandleRef.current = null;
  }, []);

  const appendMessage = useCallback(
    (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
      if (persistenceEnabled) onMessagePersisted?.(message);
    },
    [persistenceEnabled, onMessagePersisted],
  );

  const visibleModels = useMemo(
    () => (modelsProvider === provider ? models : []),
    [modelsProvider, provider, models],
  );
  const selectedModel = useMemo(
    () =>
      model && visibleModels.some((option) => option.id === model)
        ? model
        : visibleModels[0]?.id || model,
    [model, visibleModels],
  );
  const selectedModelInfo = useMemo(
    () => visibleModels.find((option) => option.id === selectedModel),
    [selectedModel, visibleModels],
  );
  const selectedModelOptions = useMemo(
    () => normalizeModelOptions(provider, modelOptions, selectedModelInfo, effort),
    [provider, modelOptions, selectedModelInfo, effort],
  );
  const selectedEffort = useMemo(
    () => readEffortFromOptions(provider, selectedModelOptions, selectedModelInfo, effort),
    [provider, selectedModelOptions, selectedModelInfo, effort],
  );
  const modelsLoading = modelListState === 'loading' || modelListState === 'idle';
  const modelsUnavailable = modelListState === 'loaded' && visibleModels.length === 0;

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: unknown }>).detail;
      const next = detail?.provider;
      if (next !== 'codex' && next !== 'claude') return;
      if (next === providerRef.current) return;
      setProviderState(next);
      const nextModel = localStorage.getItem(modelStorageKey(next)) ?? '';
      const nextEffort = readStoredEffort(next);
      const nextOptions = readStoredModelOptions(next);
      setModels([]);
      setModelsProvider(null);
      setModelListState('idle');
      setModelState(nextModel);
      setEffortState(nextEffort);
      setModelOptionsState(nextOptions);
      setProviderThreadRef(undefined);
      setDesynced(false);
    };
    window.addEventListener(SCHEMA_AGENT_PROVIDER_CHANGED, listener);
    return () => window.removeEventListener(SCHEMA_AGENT_PROVIDER_CHANGED, listener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .setProvider(provider)
      .then(() => api.getStatus())
      .then((status) => {
        if (cancelled) return;
        applyStatus(status, setReady, setUnavailableMessage);
      })
      .catch((err) => {
        if (cancelled) return;
        setReady(false);
        setUnavailableMessage(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, provider]);

  useEffect(() => {
    let cancelled = false;
    setModels([]);
    setModelsProvider(null);
    setModelListState('loading');
    api
      .setProvider(provider)
      .then(() => api.listModels(provider))
      .then((result) => {
        if (cancelled) return;
        if (!Array.isArray(result)) {
          setModelListState('error');
          return;
        }
        const parsed = result
          .filter((m): m is Record<string, unknown> & { id: string; label: string } => {
            if (!m || typeof m !== 'object') return false;
            const candidate = m as { id?: unknown; label?: unknown };
            return typeof candidate.id === 'string' && typeof candidate.label === 'string';
          })
          .map((m) => {
            const optionDescriptors = parseModelOptionDescriptors(m.optionDescriptors);
            return {
              id: m.id,
              label: m.label,
              ...(typeof m.supportsReasoningEffort === 'boolean'
                ? { supportsReasoningEffort: m.supportsReasoningEffort }
                : {}),
              ...(optionDescriptors ? { optionDescriptors } : {}),
            };
          });
        setModels(parsed);
        setModelsProvider(provider);
        setModelListState('loaded');
        if (parsed.length === 0) {
          setModelState('');
          return;
        }
        const storedModel = localStorage.getItem(modelStorageKey(provider)) ?? '';
        const storedOptions = readStoredModelOptions(provider);
        const storedEffortRaw = localStorage.getItem(effortStorageKey(provider));
        const storedEffort = normalizeEffort(provider, storedEffortRaw);
        const nextModel =
          storedModel && parsed.some((option) => option.id === storedModel)
            ? storedModel
            : parsed[0]?.id;
        const modelInfo = parsed.find((option) => option.id === nextModel);
        const nextOptions = normalizeModelOptions(
          provider,
          storedOptions,
          modelInfo,
          storedEffortRaw === null ? undefined : storedEffort,
        );
        const nextEffort = readEffortFromOptions(provider, nextOptions, modelInfo);
        if (nextModel) {
          setModelState(nextModel);
          localStorage.setItem(modelStorageKey(provider), nextModel);
          setModelOptionsState(nextOptions);
          localStorage.setItem(modelOptionsStorageKey(provider), JSON.stringify(nextOptions));
          if (nextEffort && nextEffort !== storedEffort) setEffortState(nextEffort);
          if (nextEffort) localStorage.setItem(effortStorageKey(provider), nextEffort);
          api
            .setModelOptions({ model: nextModel, effort: nextEffort, options: nextOptions })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled) setModelListState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [api, provider]);

  useEffect(() => {
    if (!selectedModel) return;
    api
      .setModelOptions({
        model: selectedModel,
        effort: selectedEffort,
        options: selectedModelOptions,
      })
      .catch(() => undefined);
  }, [api, selectedEffort, selectedModel, selectedModelOptions]);

  useEffect(() => {
    return api.onStatusChanged((status) => {
      applyStatus(status, setReady, setUnavailableMessage);
    });
  }, [api]);

  useEffect(() => {
    return api.onToolRequest(({ id, op }) => {
      const result: ApplyResult = useUndoStore.getState().apply(op as Op);
      api.replyTool(id, result);
    });
  }, [api]);

  useEffect(() => {
    return api.onThreadUpdated(({ thread }) => {
      setProviderThreadRef(thread);
      setDesynced(false);
    });
  }, [api]);

  useEffect(() => {
    return api.onThreadDesynced(({ thread }) => {
      setProviderThreadRef(thread);
      setDesynced(true);
    });
  }, [api]);

  useEffect(() => {
    return api.onAssistantDelta(({ text }) => {
      assistantBufferRef.current += text;
      scheduleLiveFlush();
    });
  }, [api, scheduleLiveFlush]);

  useEffect(() => {
    return api.onToolCallStarted(({ name }) => {
      appendMessage(mkMessage('assistant', `\`${name}\``));
    });
  }, [api, appendMessage]);

  useEffect(() => {
    return api.onAssistantFinal(({ text }) => {
      cancelLiveFlush();
      assistantBufferRef.current = '';
      setLiveAssistant('');
      const trimmed = text.trim();
      if (trimmed) appendMessage(mkMessage('assistant', trimmed));
      setStreaming(false);
    });
  }, [api, appendMessage, cancelLiveFlush]);

  useEffect(() => {
    return api.onError(({ message }) => {
      cancelLiveFlush();
      assistantBufferRef.current = '';
      setLiveAssistant('');
      appendMessage(mkMessage('assistant', `Error: ${message}`));
      setStreaming(false);
      if (isAuthMessage(message)) setAuthRequired(true);
    });
  }, [api, appendMessage, cancelLiveFlush]);

  useEffect(() => {
    const subscriber: IpcSubscriber = {
      on: (channel, listener) => {
        if (channel === 'turn:begin') return api.onTurnBegin(listener);
        if (channel === 'turn:commit') return api.onTurnCommit(listener);
        if (channel === 'turn:rollback') return api.onTurnRollback(listener);
        return () => undefined;
      },
    };
    return bindTurnToUndo(subscriber, useUndoStore.getState());
  }, [api]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming || !isReady) return;
      if (!selectedModel) {
        setUnavailableMessage('No model is available for the selected provider.');
        return;
      }
      const modelResult: { ok: boolean; error?: string } = await api
        .setModelOptions({
          model: selectedModel,
          effort: selectedEffort,
          options: selectedModelOptions,
        })
        .catch((err) => ({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      if (!modelResult.ok) {
        const message = modelResult.error ?? 'Failed to select model for this turn.';
        setUnavailableMessage(message);
        appendMessage(mkMessage('assistant', `Error: ${message}`));
        return;
      }
      appendMessage(mkMessage('user', trimmed));
      setStreaming(true);
      setLiveAssistant('');
      assistantBufferRef.current = '';
      setAuthRequired(false);
      api.setIR(schema);
      const result = await api.send(trimmed);
      if (!result.ok) {
        const message = result.error ?? 'Schema-agent send failed';
        appendMessage(mkMessage('assistant', `Error: ${message}`));
        setStreaming(false);
        if (isAuthMessage(message)) setAuthRequired(true);
      }
    },
    [
      api,
      appendMessage,
      isReady,
      isStreaming,
      schema,
      selectedEffort,
      selectedModel,
      selectedModelOptions,
    ],
  );

  const abort = useCallback(async () => {
    await api.abort();
  }, [api]);

  const restoreSettings = useCallback(
    (settings: SchemaAgentModelSettings) => {
      const nextProvider = settings.provider ?? provider;
      providerRef.current = nextProvider;
      setProviderState(nextProvider);
      localStorage.setItem('contexture-schema-agent-provider', nextProvider);

      const nextModel =
        settings.model !== undefined
          ? settings.model
          : (localStorage.getItem(modelStorageKey(nextProvider)) ?? '');
      const nextEffort = normalizeEffort(
        nextProvider,
        settings.effort ?? localStorage.getItem(effortStorageKey(nextProvider)),
      );
      const nextOptions = settings.modelOptions ?? readStoredModelOptions(nextProvider);

      setModels([]);
      setModelsProvider(null);
      setModelListState('idle');
      setModelState(nextModel);
      setEffortState(nextEffort);
      setModelOptionsState(nextOptions);
      setProviderThreadRef(undefined);
      setDesynced(false);

      localStorage.setItem(modelStorageKey(nextProvider), nextModel);
      localStorage.setItem(effortStorageKey(nextProvider), nextEffort);
      localStorage.setItem(modelOptionsStorageKey(nextProvider), JSON.stringify(nextOptions));
      api.setProvider(nextProvider).catch(() => undefined);
      window.dispatchEvent(
        new CustomEvent(SCHEMA_AGENT_PROVIDER_CHANGED, { detail: { provider: nextProvider } }),
      );
    },
    [api, provider],
  );

  const setProvider = useCallback(
    (next: SchemaAgentProvider) => {
      if (next === provider) {
        localStorage.setItem('contexture-schema-agent-provider', next);
        api.setProvider(next).catch(() => undefined);
        return;
      }
      providerRef.current = next;
      setProviderState(next);
      localStorage.setItem('contexture-schema-agent-provider', next);
      const nextModel = localStorage.getItem(modelStorageKey(next)) ?? '';
      const nextEffort = readStoredEffort(next);
      const nextOptions = readStoredModelOptions(next);
      setModels([]);
      setModelsProvider(null);
      setModelListState('idle');
      setModelState(nextModel);
      setEffortState(nextEffort);
      setModelOptionsState(nextOptions);
      setProviderThreadRef(undefined);
      setDesynced(false);
      api.setProvider(next).catch(() => undefined);
      window.dispatchEvent(
        new CustomEvent(SCHEMA_AGENT_PROVIDER_CHANGED, { detail: { provider: next } }),
      );
    },
    [api, provider],
  );

  const setModel = useCallback(
    (next: string) => {
      setModelState(next);
      localStorage.setItem(modelStorageKey(provider), next);
      const modelInfo = models.find((option) => option.id === next);
      const nextOptions = normalizeModelOptions(provider, modelOptions, modelInfo);
      const nextEffort = readEffortFromOptions(provider, nextOptions, modelInfo);
      setModelOptionsState(nextOptions);
      localStorage.setItem(modelOptionsStorageKey(provider), JSON.stringify(nextOptions));
      if (nextEffort && nextEffort !== effort) {
        setEffortState(nextEffort);
        localStorage.setItem(effortStorageKey(provider), nextEffort);
      }
    },
    [effort, modelOptions, models, provider],
  );

  const setEffort = useCallback(
    (next: string) => {
      const activeModel = models.find((option) => option.id === model);
      const descriptor = findEffortDescriptor(activeModel);
      const normalized = descriptor
        ? normalizeModelOptionValue(
            descriptor,
            provider === 'codex' && next === 'med' ? 'medium' : next,
          )
        : normalizeEffort(provider, next);
      const nextOptions = descriptor
        ? { ...modelOptions, [descriptor.id]: normalized }
        : modelOptions;
      setModelOptionsState(nextOptions);
      setEffortState(normalized);
      localStorage.setItem(modelOptionsStorageKey(provider), JSON.stringify(nextOptions));
      localStorage.setItem(effortStorageKey(provider), normalized);
    },
    [model, modelOptions, models, provider],
  );

  const setModelOption = useCallback(
    (id: string, value: string | boolean) => {
      const nextOptions = { ...modelOptions, [id]: value };
      const activeModel = models.find((option) => option.id === model);
      const nextEffort = readEffortFromOptions(provider, nextOptions, activeModel);
      setModelOptionsState(nextOptions);
      localStorage.setItem(modelOptionsStorageKey(provider), JSON.stringify(nextOptions));
      if (nextEffort) {
        setEffortState(nextEffort);
        localStorage.setItem(effortStorageKey(provider), nextEffort);
      }
    },
    [model, modelOptions, models, provider],
  );

  const hydrate = useCallback((next: ChatMessage[]) => setMessages(next), []);
  const clear = useCallback(() => {
    setMessages([]);
    cancelLiveFlush();
    assistantBufferRef.current = '';
    setLiveAssistant('');
  }, [cancelLiveFlush]);
  const clearAuthRequired = useCallback(() => setAuthRequired(false), []);

  return {
    provider,
    providerLabel: provider === 'codex' ? 'Codex' : 'Claude',
    setProvider,
    restoreSettings,
    models: visibleModels,
    modelsLoading,
    modelsUnavailable,
    model: selectedModel,
    setModel,
    modelOptions: selectedModelOptions,
    setModelOption,
    effort: selectedEffort,
    setEffort,
    messages,
    isStreaming,
    liveAssistant,
    authRequired,
    isReady,
    unavailableMessage,
    providerThreadRef,
    desynced,
    clearAuthRequired,
    send,
    abort,
    hydrate,
    clear,
  };
}

function applyStatus(
  status: unknown,
  setReady: (ready: boolean) => void,
  setUnavailableMessage: (message: string | null) => void,
): void {
  const readiness =
    status && typeof status === 'object' ? (status as { readiness?: unknown }).readiness : null;
  if (readiness === 'authenticated_chatgpt' || readiness === 'authenticated_api_key') {
    setReady(true);
    setUnavailableMessage(null);
    return;
  }
  if (readiness === 'authenticated_cli') {
    setReady(true);
    setUnavailableMessage(null);
    return;
  }
  setReady(false);
  const provider =
    status && typeof status === 'object' ? (status as { provider?: unknown }).provider : null;
  setUnavailableMessage(readinessToMessage(readiness, provider));
}

function readinessToMessage(readiness: unknown, provider: unknown): string {
  const label = provider === 'claude' ? 'Claude' : 'Codex';
  if (readiness === 'cli_missing') return `${label} CLI not detected.`;
  if (readiness === 'cli_outdated') return `${label} CLI is outdated.`;
  if (readiness === 'app_server_unavailable') return `${label} app-server is unavailable.`;
  if (readiness === 'not_signed_in') return `Sign in to ${label} to start chatting.`;
  if (readiness === 'rate_limited') return `${label} is currently rate-limited.`;
  if (readiness === 'desynced') return `${label} thread is desynced. Start a new chat.`;
  return `${label} is not ready.`;
}

function isAuthMessage(message: string): boolean {
  return /auth|sign.?in|unauthori[sz]ed|api key/i.test(message);
}

function modelStorageKey(provider: SchemaAgentProvider): string {
  return `contexture-schema-agent-${provider}-model`;
}

function effortStorageKey(provider: SchemaAgentProvider): string {
  return `contexture-schema-agent-${provider}-effort`;
}

function modelOptionsStorageKey(provider: SchemaAgentProvider): string {
  return `contexture-schema-agent-${provider}-model-options`;
}

function readStoredModelOptions(provider: SchemaAgentProvider): SchemaAgentModelOptions {
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

function readStoredEffort(provider: SchemaAgentProvider): string {
  return normalizeEffort(provider, localStorage.getItem(effortStorageKey(provider)));
}

function defaultEffort(provider: SchemaAgentProvider): string {
  return provider === 'codex' ? 'high' : 'auto';
}

function normalizeEffort(provider: SchemaAgentProvider, effort: unknown): string {
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

function normalizeEffortForModel(
  provider: SchemaAgentProvider,
  effort: unknown,
  model?: SchemaAgentModelInfo,
): string {
  const descriptor = findEffortDescriptor(model);
  if (descriptor) {
    const raw = typeof effort === 'string' ? effort : null;
    const alias = provider === 'codex' && raw === 'med' ? 'medium' : raw;
    if (alias && descriptor.options.some((option) => option.id === alias)) return alias;
    return (
      descriptor.options.find((option) => option.isDefault)?.id ??
      descriptor.options[0]?.id ??
      defaultEffort(provider)
    );
  }
  return normalizeEffort(provider, effort);
}

function normalizeModelOptions(
  provider: SchemaAgentProvider,
  options: SchemaAgentModelOptions,
  model?: SchemaAgentModelInfo,
  effort?: string,
): SchemaAgentModelOptions {
  const descriptors = model?.optionDescriptors ?? [];
  if (descriptors.length === 0) return options;
  const normalized: SchemaAgentModelOptions = {};
  for (const descriptor of descriptors) {
    if (descriptor.type === 'select') {
      const rawValue =
        options[descriptor.id] ??
        (isEffortDescriptor(descriptor) ? effort : undefined) ??
        descriptor.currentValue;
      normalized[descriptor.id] = normalizeModelOptionValue(
        descriptor,
        provider === 'codex' && rawValue === 'med' ? 'medium' : rawValue,
      );
    } else {
      const rawValue = options[descriptor.id] ?? descriptor.currentValue ?? descriptor.defaultValue;
      normalized[descriptor.id] = typeof rawValue === 'boolean' ? rawValue : false;
    }
  }
  return normalized;
}

function normalizeModelOptionValue(
  descriptor: Extract<SchemaAgentModelOptionDescriptor, { type: 'select' }>,
  value: unknown,
): string {
  if (typeof value === 'string' && descriptor.options.some((option) => option.id === value)) {
    return value;
  }
  return (
    descriptor.options.find((option) => option.isDefault)?.id ?? descriptor.options[0]?.id ?? ''
  );
}

function readEffortFromOptions(
  provider: SchemaAgentProvider,
  options: SchemaAgentModelOptions,
  model?: SchemaAgentModelInfo,
  fallbackEffort?: string,
): string {
  const descriptor = findEffortDescriptor(model);
  const value = descriptor ? options[descriptor.id] : undefined;
  if (typeof value === 'string' && value.length > 0) return value;
  return normalizeEffortForModel(provider, fallbackEffort, model);
}

function findEffortDescriptor(
  model?: SchemaAgentModelInfo,
): Extract<SchemaAgentModelOptionDescriptor, { type: 'select' }> | null {
  const descriptor = model?.optionDescriptors?.find(
    (candidate) => candidate.type === 'select' && isEffortDescriptor(candidate),
  );
  return descriptor?.type === 'select' ? descriptor : null;
}

function isEffortDescriptor(descriptor: SchemaAgentModelOptionDescriptor): boolean {
  return descriptor.id === 'effort' || descriptor.id === 'reasoningEffort';
}

function parseModelOptionDescriptors(
  value: unknown,
): SchemaAgentModelOptionDescriptor[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value
    .map(parseModelOptionDescriptor)
    .filter((descriptor): descriptor is SchemaAgentModelOptionDescriptor => descriptor !== null);
  return parsed.length > 0 ? parsed : undefined;
}

function parseModelOptionDescriptor(value: unknown): SchemaAgentModelOptionDescriptor | null {
  if (!value || typeof value !== 'object') return null;
  const descriptor = value as Record<string, unknown>;
  if (typeof descriptor.id !== 'string' || typeof descriptor.label !== 'string') return null;
  if (descriptor.type === 'boolean') {
    return {
      id: descriptor.id,
      type: 'boolean',
      label: descriptor.label,
      ...(typeof descriptor.defaultValue === 'boolean'
        ? { defaultValue: descriptor.defaultValue }
        : {}),
      ...(typeof descriptor.currentValue === 'boolean'
        ? { currentValue: descriptor.currentValue }
        : {}),
    };
  }
  if (descriptor.type !== 'select' || !Array.isArray(descriptor.options)) return null;
  const options = descriptor.options
    .map(parseSelectOption)
    .filter(
      (option): option is { id: string; label: string; isDefault?: boolean } => option !== null,
    );
  if (options.length === 0) return null;
  return {
    id: descriptor.id,
    type: 'select',
    label: descriptor.label,
    options,
    ...(typeof descriptor.currentValue === 'string'
      ? { currentValue: descriptor.currentValue }
      : {}),
  };
}

function parseSelectOption(
  value: unknown,
): { id: string; label: string; isDefault?: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const option = value as Record<string, unknown>;
  if (typeof option.id !== 'string' || typeof option.label !== 'string') return null;
  return {
    id: option.id,
    label: option.label,
    ...(option.isDefault === true ? { isDefault: true } : {}),
  };
}
