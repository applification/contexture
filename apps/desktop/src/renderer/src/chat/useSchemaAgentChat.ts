import type { ChatHistory, ChatMessage, ChatRole } from '@contexture/core';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatContextAttachment, ContextureSchemaAgentAPI } from '../../../preload/index.d';
import { useAgentTurnsStore } from '../store/agent-turns';
import { useChatComposerStore } from '../store/chat-composer';
import type { ApplyResult, Op } from '../store/ops';
import {
  effortStorageKey,
  modelStorageKey,
  normalizeEffort,
  providerLabel,
  readStoredModelOptions,
  type SchemaAgentModelOptions,
  type SchemaAgentModelSettings,
  type SchemaAgentProvider,
  useSchemaAgentSettingsStore,
} from '../store/schema-agent-settings';
import { subscribeUndoHistory, subscribeUndoMutations, useUndoStore } from '../store/undo';
import {
  type SchemaAgentModelInfo,
  type SchemaAgentModelOptionDescriptor,
  useSchemaAgentModelsStore,
} from './schemaAgentModelsStore';
import { useSchemaAgentSessionStore } from './schemaAgentSessionStore';
import { bindTurnToUndo, type IpcSubscriber } from './turn-binder';

export type {
  ChatContextAttachment,
  SchemaAgentModelInfo,
  SchemaAgentModelOptionDescriptor,
  SchemaAgentModelOptions,
  SchemaAgentModelSettings,
  SchemaAgentProvider,
};

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
  send: (text: string, attachments?: ChatContextAttachment[]) => Promise<void>;
  abort: () => Promise<void>;
  hydrate: (messages: ChatMessage[]) => void;
  hydrateHistory: (history: ChatHistory) => void;
  toHistory: () => ChatHistory;
  clear: () => void;
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

function mkUserMessage(content: string, attachments: ChatContextAttachment[]): ChatMessage {
  return {
    ...mkMessage('user', content),
    ...(attachments.length > 0
      ? {
          contextAttachments: attachments.map(
            ({ id, path, name, size, kind, mimeType, truncated }) => ({
              id,
              path,
              name,
              size,
              ...(kind ? { kind } : {}),
              ...(mimeType ? { mimeType } : {}),
              ...(truncated ? { truncated: true } : {}),
            }),
          ),
        }
      : {}),
  };
}

function readToolError(result: unknown): string {
  if (result && typeof result === 'object') {
    const error = (result as { error?: unknown }).error;
    if (typeof error === 'string') return error;
  }
  return 'Tool call failed';
}

function appendAssistantText(current: string, text: string, boundary?: 'new_message'): string {
  if (!text) return current;
  if (boundary === 'new_message' && current.trim().length > 0) return `${current}\n\n${text}`;
  return current + text;
}

export function useSchemaAgentChat({
  api,
  onMessagePersisted,
}: UseSchemaAgentChatOptions): SchemaAgentChatState {
  useState(() => {
    useSchemaAgentSettingsStore.getState().reloadFromStorage();
    return null;
  });
  const messages = useSchemaAgentSessionStore((s) => s.messages);
  const isStreaming = useSchemaAgentSessionStore((s) => s.isStreaming);
  const liveAssistant = useSchemaAgentSessionStore((s) => s.liveAssistant);
  const authRequired = useSchemaAgentSessionStore((s) => s.authRequired);
  const isReady = useSchemaAgentSessionStore((s) => s.isReady);
  const unavailableMessage = useSchemaAgentSessionStore((s) => s.unavailableMessage);
  const providerThreadRef = useSchemaAgentSessionStore((s) => s.providerThreadRef);
  const desynced = useSchemaAgentSessionStore((s) => s.desynced);
  const appendSessionMessage = useSchemaAgentSessionStore((s) => s.appendMessage);
  const beginTurn = useSchemaAgentSessionStore((s) => s.beginTurn);
  const finishAssistant = useSchemaAgentSessionStore((s) => s.finishAssistant);
  const failTurn = useSchemaAgentSessionStore((s) => s.failTurn);
  const setLiveAssistant = useSchemaAgentSessionStore((s) => s.setLiveAssistant);
  const hydrateHistoryState = useSchemaAgentSessionStore((s) => s.hydrateHistoryState);
  const clearTranscript = useSchemaAgentSessionStore((s) => s.clearTranscript);
  const setProviderThread = useSchemaAgentSessionStore((s) => s.setProviderThread);
  const clearAuthRequiredAction = useSchemaAgentSessionStore((s) => s.clearAuthRequired);
  const setReadiness = useSchemaAgentSessionStore((s) => s.setReadiness);
  const setUnavailableMessage = useSchemaAgentSessionStore((s) => s.setUnavailableMessage);
  const provider = useSchemaAgentSettingsStore((s) => s.provider);
  const model = useSchemaAgentSettingsStore((s) => s.model);
  const effort = useSchemaAgentSettingsStore((s) => s.effort);
  const modelOptions = useSchemaAgentSettingsStore((s) => s.modelOptions);
  const setProviderSetting = useSchemaAgentSettingsStore((s) => s.setProvider);
  const restoreModelSettings = useSchemaAgentSettingsStore((s) => s.restoreSettings);
  const setModelSetting = useSchemaAgentSettingsStore((s) => s.setModel);
  const setEffortSetting = useSchemaAgentSettingsStore((s) => s.setEffort);
  const setModelOptionsSetting = useSchemaAgentSettingsStore((s) => s.setModelOptions);
  const models = useSchemaAgentModelsStore((s) => s.models);
  const modelsProvider = useSchemaAgentModelsStore((s) => s.provider);
  const modelListState = useSchemaAgentModelsStore((s) => s.status);
  const beginLoadingModels = useSchemaAgentModelsStore((s) => s.beginLoading);
  const acceptLoadedModels = useSchemaAgentModelsStore((s) => s.acceptLoaded);
  const failLoadingModels = useSchemaAgentModelsStore((s) => s.failLoading);
  const providerRef = useRef(provider);
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const persistenceEnabled = useChatComposerStore((s) => s.chatHistoryPersistence);
  const assistantBufferRef = useRef('');
  const rafHandleRef = useRef<number | null>(null);
  const pendingUserMessageRef = useRef<string | undefined>(undefined);

  const flushLiveAssistant = useCallback(() => {
    rafHandleRef.current = null;
    setLiveAssistant(assistantBufferRef.current);
  }, [setLiveAssistant]);

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
      appendSessionMessage(message);
      if (persistenceEnabled) onMessagePersisted?.(message);
    },
    [appendSessionMessage, persistenceEnabled, onMessagePersisted],
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
  const latestTurnContextRef = useRef({
    schema,
    provider,
    model: selectedModel,
    providerThreadRef,
  });
  const modelsLoading = modelListState === 'loading' || modelListState === 'idle';
  const modelsUnavailable = modelListState === 'loaded' && visibleModels.length === 0;

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    latestTurnContextRef.current = {
      schema,
      provider,
      model: selectedModel,
      providerThreadRef,
    };
  }, [provider, providerThreadRef, schema, selectedModel]);

  useEffect(() => {
    const markDesynced = () => {
      const thread = useSchemaAgentSessionStore.getState().providerThreadRef;
      if (!thread) return;
      setProviderThread(thread, true);
    };
    const unsubscribeMutations = subscribeUndoMutations((event) => {
      if (event.meta.source === 'schema_agent') return;
      markDesynced();
    });
    const unsubscribeHistory = subscribeUndoHistory(markDesynced);
    return () => {
      unsubscribeMutations();
      unsubscribeHistory();
    };
  }, [setProviderThread]);

  useEffect(() => {
    let cancelled = false;
    api
      .setProvider(provider)
      .then(() => api.getStatus())
      .then((status) => {
        if (cancelled) return;
        applyStatus(status, setReadiness);
      })
      .catch((err) => {
        if (cancelled) return;
        setReadiness(false, err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, provider, setReadiness]);

  useEffect(() => {
    let cancelled = false;
    beginLoadingModels(provider);
    api
      .setProvider(provider)
      .then(() => api.listModels(provider))
      .then((result) => {
        if (cancelled) return;
        if (!Array.isArray(result)) {
          failLoadingModels(provider);
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
        acceptLoadedModels(provider, parsed);
        if (parsed.length === 0) {
          setModelSetting('');
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
          setModelSetting(nextModel);
          setModelOptionsSetting(nextOptions);
          if (nextEffort && nextEffort !== storedEffort) setEffortSetting(nextEffort);
          api
            .setModelOptions({ model: nextModel, effort: nextEffort, options: nextOptions })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled) failLoadingModels(provider);
      });
    return () => {
      cancelled = true;
    };
  }, [
    acceptLoadedModels,
    api,
    beginLoadingModels,
    failLoadingModels,
    provider,
    setEffortSetting,
    setModelOptionsSetting,
    setModelSetting,
  ]);

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
      applyStatus(status, setReadiness);
    });
  }, [api, setReadiness]);

  useEffect(() => {
    return api.onToolRequest(({ id, op }) => {
      const result: ApplyResult = useUndoStore
        .getState()
        .apply(op as Op, { source: 'schema_agent' });
      useAgentTurnsStore.getState().recordToolResult({ id, op: op as Op, result });
      api.replyTool(id, result);
    });
  }, [api]);

  useEffect(() => {
    return api.onThreadUpdated(({ thread }) => {
      setProviderThread(thread, false);
    });
  }, [api, setProviderThread]);

  useEffect(() => {
    return api.onThreadDesynced(({ thread }) => {
      setProviderThread(thread, true);
    });
  }, [api, setProviderThread]);

  useEffect(() => {
    return api.onAssistantDelta(({ text, boundary }) => {
      assistantBufferRef.current = appendAssistantText(assistantBufferRef.current, text, boundary);
      scheduleLiveFlush();
    });
  }, [api, scheduleLiveFlush]);

  useEffect(() => {
    return api.onToolCallStarted(({ id, name, input }) => {
      useAgentTurnsStore.getState().recordToolCallStarted({ id, name, input });
    });
  }, [api]);

  useEffect(() => {
    return api.onToolCallFinished(({ id, name, ok, result }) => {
      useAgentTurnsStore.getState().recordToolResult({
        id,
        name,
        result: ok ? result : { error: readToolError(result) },
      });
    });
  }, [api]);

  useEffect(() => {
    return api.onAssistantFinal(({ text }) => {
      cancelLiveFlush();
      assistantBufferRef.current = '';
      const trimmed = text.trim();
      const message = trimmed ? mkMessage('assistant', trimmed) : null;
      if (trimmed) useAgentTurnsStore.getState().setAssistantText(trimmed);
      finishAssistant(message);
      if (message && persistenceEnabled) onMessagePersisted?.(message);
    });
  }, [api, cancelLiveFlush, finishAssistant, onMessagePersisted, persistenceEnabled]);

  useEffect(() => {
    return api.onError(({ message }) => {
      cancelLiveFlush();
      assistantBufferRef.current = '';
      const errorMessage = mkMessage('assistant', `Error: ${message}`);
      failTurn(errorMessage, isAuthMessage(message));
      if (persistenceEnabled) onMessagePersisted?.(errorMessage);
    });
  }, [api, cancelLiveFlush, failTurn, onMessagePersisted, persistenceEnabled]);

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

  useEffect(() => {
    const unsubBegin = api.onTurnBegin(() => {
      const context = latestTurnContextRef.current;
      useAgentTurnsStore.getState().begin({
        userMessage: pendingUserMessageRef.current,
        provider: context.provider,
        model: context.model,
        providerThreadRef: context.providerThreadRef,
        before: context.schema,
      });
    });
    const unsubCommit = api.onTurnCommit(() => {
      useAgentTurnsStore.getState().finish({
        status: 'committed',
        after: useUndoStore.getState().schema,
      });
      pendingUserMessageRef.current = undefined;
    });
    const unsubRollback = api.onTurnRollback(() => {
      useAgentTurnsStore.getState().finish({
        status: 'rolled_back',
        after: useUndoStore.getState().schema,
      });
      pendingUserMessageRef.current = undefined;
    });
    return () => {
      unsubBegin();
      unsubCommit();
      unsubRollback();
    };
  }, [api]);

  const send = useCallback(
    async (text: string, attachments: ChatContextAttachment[] = []) => {
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
      const userMessage = mkUserMessage(trimmed, attachments);
      beginTurn(userMessage);
      pendingUserMessageRef.current = trimmed;
      if (persistenceEnabled) onMessagePersisted?.(userMessage);
      assistantBufferRef.current = '';
      api.setIR(schema);
      const result = await api.send(trimmed, attachments);
      if (!result.ok) {
        const message = result.error ?? 'Schema-agent send failed';
        const errorMessage = mkMessage('assistant', `Error: ${message}`);
        failTurn(errorMessage, isAuthMessage(message));
        if (persistenceEnabled) onMessagePersisted?.(errorMessage);
      }
    },
    [
      api,
      appendMessage,
      beginTurn,
      failTurn,
      isReady,
      isStreaming,
      onMessagePersisted,
      persistenceEnabled,
      schema,
      selectedEffort,
      selectedModel,
      selectedModelOptions,
      setUnavailableMessage,
    ],
  );

  const abort = useCallback(async () => {
    await api.abort();
  }, [api]);

  const restoreSettings = useCallback(
    (settings: SchemaAgentModelSettings) => {
      const currentProvider = useSchemaAgentSettingsStore.getState().provider;
      const nextProvider = settings.provider ?? currentProvider;
      providerRef.current = nextProvider;
      restoreModelSettings(settings);
      if (nextProvider !== useSchemaAgentModelsStore.getState().provider) {
        beginLoadingModels(nextProvider);
      }
      setProviderThread(undefined, false);

      api.setProvider(nextProvider).catch(() => undefined);
    },
    [api, beginLoadingModels, restoreModelSettings, setProviderThread],
  );

  const setProvider = useCallback(
    (next: SchemaAgentProvider) => {
      const currentProvider = useSchemaAgentSettingsStore.getState().provider;
      if (next === currentProvider) {
        setProviderSetting(next);
        api.setProvider(next).catch(() => undefined);
        return;
      }
      providerRef.current = next;
      setProviderSetting(next);
      beginLoadingModels(next);
      setProviderThread(undefined, false);
      api.setProvider(next).catch(() => undefined);
    },
    [api, beginLoadingModels, setProviderSetting, setProviderThread],
  );

  const setModel = useCallback(
    (next: string) => {
      setModelSetting(next);
      const modelInfo = models.find((option) => option.id === next);
      const nextOptions = normalizeModelOptions(provider, modelOptions, modelInfo);
      const nextEffort = readEffortFromOptions(provider, nextOptions, modelInfo);
      setModelOptionsSetting(nextOptions);
      if (nextEffort && nextEffort !== effort) {
        setEffortSetting(nextEffort);
      }
    },
    [
      effort,
      modelOptions,
      models,
      provider,
      setEffortSetting,
      setModelOptionsSetting,
      setModelSetting,
    ],
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
      setModelOptionsSetting(nextOptions);
      setEffortSetting(normalized);
    },
    [model, modelOptions, models, provider, setEffortSetting, setModelOptionsSetting],
  );

  const setModelOption = useCallback(
    (id: string, value: string | boolean) => {
      const nextOptions = { ...modelOptions, [id]: value };
      const activeModel = models.find((option) => option.id === model);
      const nextEffort = readEffortFromOptions(provider, nextOptions, activeModel);
      setModelOptionsSetting(nextOptions);
      if (nextEffort) {
        setEffortSetting(nextEffort);
      }
    },
    [model, modelOptions, models, provider, setEffortSetting, setModelOptionsSetting],
  );

  const hydrate = useCallback(
    (next: ChatMessage[]) => {
      hydrateHistoryState({ version: '1', messages: next });
      useAgentTurnsStore.getState().reset();
    },
    [hydrateHistoryState],
  );
  const hydrateHistory = useCallback(
    (history: ChatHistory) => {
      if (hasModelSettings(history)) {
        restoreSettings({
          provider: history.provider,
          model: history.model,
          effort: history.effort,
          modelOptions: history.modelOptions,
        });
      }
      useAgentTurnsStore.getState().hydrate(history.agentTurns ?? []);
      hydrateHistoryState(history);
      if (history.providerThreadRef) {
        api.threadSet(history.providerThreadRef).catch(() => undefined);
      } else {
        api.threadClear().catch(() => undefined);
      }
    },
    [api, hydrateHistoryState, restoreSettings],
  );
  const toHistory = useCallback((): ChatHistory => {
    const history: ChatHistory = {
      version: '1',
      messages,
      provider,
      ...(selectedModel ? { model: selectedModel } : {}),
      ...(selectedEffort ? { effort: selectedEffort } : {}),
      ...(Object.keys(selectedModelOptions).length > 0
        ? { modelOptions: selectedModelOptions }
        : {}),
      ...(providerThreadRef ? { providerThreadRef } : {}),
      ...(useAgentTurnsStore.getState().turns.length > 0
        ? { agentTurns: useAgentTurnsStore.getState().turns }
        : {}),
    };
    return history;
  }, [messages, provider, providerThreadRef, selectedEffort, selectedModel, selectedModelOptions]);
  const clear = useCallback(() => {
    clearTranscript();
    useAgentTurnsStore.getState().reset();
    cancelLiveFlush();
    assistantBufferRef.current = '';
  }, [cancelLiveFlush, clearTranscript]);
  const clearAuthRequired = useCallback(() => clearAuthRequiredAction(), [clearAuthRequiredAction]);

  return {
    provider,
    providerLabel: providerLabel(provider),
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
    hydrateHistory,
    toHistory,
    clear,
  };
}

function applyStatus(
  status: unknown,
  setReadiness: (ready: boolean, message: string | null) => void,
): void {
  const readiness =
    status && typeof status === 'object' ? (status as { readiness?: unknown }).readiness : null;
  if (readiness === 'authenticated_chatgpt' || readiness === 'authenticated_api_key') {
    setReadiness(true, null);
    return;
  }
  if (readiness === 'authenticated_cli') {
    setReadiness(true, null);
    return;
  }
  const provider =
    status && typeof status === 'object' ? (status as { provider?: unknown }).provider : null;
  setReadiness(false, readinessToMessage(readiness, provider));
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

function hasModelSettings(history: ChatHistory): boolean {
  return (
    history.provider !== undefined ||
    history.model !== undefined ||
    history.effort !== undefined ||
    history.modelOptions !== undefined
  );
}

function defaultEffort(provider: SchemaAgentProvider): string {
  return provider === 'codex' ? 'high' : 'auto';
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
