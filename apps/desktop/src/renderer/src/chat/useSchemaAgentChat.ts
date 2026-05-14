import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ContextureSchemaAgentAPI } from '../../../preload/index.d';
import type { ChatMessage, ChatRole } from '../model/chat-history';
import { useChatComposerStore } from '../store/chat-composer';
import type { ApplyResult, Op } from '../store/ops';
import { useUndoStore } from '../store/undo';
import { bindTurnToUndo, type IpcSubscriber } from './turn-binder';

export interface SchemaAgentChatState {
  providerLabel: 'Codex';
  models: Array<{ id: string; label: string; supportsReasoningEffort?: boolean }>;
  model: string;
  setModel: (model: string) => void;
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
  const [models, setModels] = useState<
    Array<{ id: string; label: string; supportsReasoningEffort?: boolean }>
  >([]);
  const [model, setModelState] = useState(
    () => localStorage.getItem('contexture-codex-model') ?? '',
  );
  const [effort, setEffortState] = useState(
    () => localStorage.getItem('contexture-codex-effort') ?? 'high',
  );
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

  useEffect(() => {
    let cancelled = false;
    api
      .getStatus()
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
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    api
      .listModels()
      .then((result) => {
        if (cancelled || !Array.isArray(result)) return;
        const parsed = result
          .filter((m): m is { id: string; label: string; supportsReasoningEffort?: boolean } => {
            if (!m || typeof m !== 'object') return false;
            const candidate = m as { id?: unknown; label?: unknown };
            return typeof candidate.id === 'string' && typeof candidate.label === 'string';
          })
          .map((m) => ({
            id: m.id,
            label: m.label,
            supportsReasoningEffort: m.supportsReasoningEffort,
          }));
        setModels(parsed);
        if (!model && parsed[0]) {
          setModelState(parsed[0].id);
          localStorage.setItem('contexture-codex-model', parsed[0].id);
          api.setModelOptions({ model: parsed[0].id, effort }).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, effort, model]);

  useEffect(() => {
    if (!model) return;
    api.setModelOptions({ model, effort }).catch(() => undefined);
  }, [api, model, effort]);

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
    [api, appendMessage, isReady, isStreaming, schema],
  );

  const abort = useCallback(async () => {
    await api.abort();
  }, [api]);

  const setModel = useCallback((next: string) => {
    setModelState(next);
    localStorage.setItem('contexture-codex-model', next);
  }, []);

  const setEffort = useCallback((next: string) => {
    setEffortState(next);
    localStorage.setItem('contexture-codex-effort', next);
  }, []);

  const hydrate = useCallback((next: ChatMessage[]) => setMessages(next), []);
  const clear = useCallback(() => {
    setMessages([]);
    cancelLiveFlush();
    assistantBufferRef.current = '';
    setLiveAssistant('');
  }, [cancelLiveFlush]);
  const clearAuthRequired = useCallback(() => setAuthRequired(false), []);

  return {
    providerLabel: 'Codex',
    models,
    model,
    setModel,
    effort,
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
  setReady(false);
  setUnavailableMessage(readinessToMessage(readiness));
}

function readinessToMessage(readiness: unknown): string {
  if (readiness === 'cli_missing') return 'Codex CLI not detected.';
  if (readiness === 'cli_outdated') return 'Codex CLI is outdated.';
  if (readiness === 'app_server_unavailable') return 'Codex app-server is unavailable.';
  if (readiness === 'not_signed_in') return 'Sign in to Codex to start chatting.';
  if (readiness === 'rate_limited') return 'Codex is currently rate-limited.';
  if (readiness === 'desynced') return 'Codex thread is desynced. Start a new chat.';
  return 'Codex is not ready.';
}

function isAuthMessage(message: string): boolean {
  return /auth|sign.?in|unauthori[sz]ed|api key/i.test(message);
}
