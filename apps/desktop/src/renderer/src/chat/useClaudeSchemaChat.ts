/**
 * `useClaudeSchemaChat` — React hook wrapping the chat preload surface.
 *
 * Responsibilities:
 *   - Own the visible message list (user + assistant, with tool-use
 *     entries rendered inline as status lines).
 *   - Forward the current IR to main once per turn so the system-prompt
 *     builder has it.
 *   - Dispatch incoming op-requests into the renderer store and reply
 *     via `replyOp`, so SDK tool calls (the 13 ops) converge the graph.
 *   - Bind turn:begin/commit/rollback to the undoable store's
 *     transaction API (via `turn-binder.ts`) so every turn collapses to
 *     one undo entry regardless of how many ops it dispatched.
 *   - Persist chat history to the sidecar when the UI toggle is on;
 *     append user + final assistant text, skip tool-use status lines.
 *
 * The `api` argument is required (not derived from `window.contexture`)
 * so tests can inject a fake transport without touching Electron.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ContextureChatAPI } from '../../../preload/index.d';
import type { ChatMessage, ChatRole } from '../model/chat-history';
import type { ApplyResult, Op } from '../store/ops';
import { useUIStore } from '../store/ui';
import { useUndoStore } from '../store/undo';
import { bindTurnToUndo, type IpcSubscriber } from './turn-binder';

export interface ClaudeSchemaChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (text: string) => Promise<void>;
  /** Replace the visible history (used when loading a sidecar file). */
  hydrate: (messages: ChatMessage[]) => void;
  /** Clear the transcript without touching the sidecar. */
  clear: () => void;
}

export interface UseClaudeSchemaChatOptions {
  api: ContextureChatAPI;
  /** Persist every appended message. Called after the in-memory push. */
  onMessagePersisted?: (message: ChatMessage) => void;
}

function mkId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function mkMessage(role: ChatRole, content: string): ChatMessage {
  return { id: mkId(), role, content, createdAt: Date.now() };
}

export function useClaudeSchemaChat({
  api,
  onMessagePersisted,
}: UseClaudeSchemaChatOptions): ClaudeSchemaChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const persistenceEnabled = useUIStore((s) => s.chatHistoryPersistence);

  // `assistantBufferRef` aggregates assistant text chunks across a turn
  // so the UI sees one final message, not a chunk per websocket frame.
  const assistantBufferRef = useRef<string>('');

  const appendMessage = useCallback(
    (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
      if (persistenceEnabled) onMessagePersisted?.(message);
    },
    [persistenceEnabled, onMessagePersisted],
  );

  // Wire op-requests → store.apply → reply.
  useEffect(() => {
    return api.onOpRequest(({ id, op }) => {
      const result: ApplyResult = useUndoStore.getState().apply(op as Op);
      api.replyOp(id, result);
    });
  }, [api]);

  // Wire assistant text chunks.
  useEffect(() => {
    return api.onAssistant(({ text }) => {
      assistantBufferRef.current += text;
    });
  }, [api]);

  // Wire tool-use as a compact status line.
  useEffect(() => {
    return api.onToolUse(({ name }) => {
      // Lightweight footprint so the transcript stays readable; the real
      // graph animation happens via onOpRequest.
      appendMessage(mkMessage('assistant', `\`${name}\``));
    });
  }, [api, appendMessage]);

  // Wire turn end — flush the buffer, stop streaming.
  useEffect(() => {
    return api.onResult(() => {
      const buffered = assistantBufferRef.current.trim();
      assistantBufferRef.current = '';
      if (buffered) appendMessage(mkMessage('assistant', buffered));
      setStreaming(false);
    });
  }, [api, appendMessage]);

  useEffect(() => {
    return api.onError(({ message }) => {
      assistantBufferRef.current = '';
      appendMessage(mkMessage('assistant', `Error: ${message}`));
      setStreaming(false);
    });
  }, [api, appendMessage]);

  // Bind turn lifecycle to the undoable store so the whole turn is one
  // undo step regardless of how many ops the SDK emits.
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
      if (!trimmed || isStreaming) return;
      appendMessage(mkMessage('user', trimmed));
      setStreaming(true);
      api.setIR(schema);
      await api.send(trimmed);
    },
    [api, appendMessage, isStreaming, schema],
  );

  const hydrate = useCallback((next: ChatMessage[]) => setMessages(next), []);
  const clear = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, send, hydrate, clear };
}
