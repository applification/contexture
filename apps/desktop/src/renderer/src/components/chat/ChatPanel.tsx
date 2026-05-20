/**
 * ChatPanel — the Schema agent chat surface.
 *
 * Chat layout:
 *   - Header with a thread-list toggle, thread title, and New-chat
 *     button.
 *   - Thread list (when toggled) scoped to the currently-open schema
 *     file, with switch + delete actions.
 *   - Empty state (BotMessageSquare) when there are no messages, with
 *     auth-aware copy ("Not connected" if the toolbar popover hasn't
 *     been configured).
 *   - Message list rendered as user bubbles (right-aligned primary),
 *     tool-use status lines (small monospace chips), and assistant
 *     markdown via `Streamdown`.
 *   - Prompt input as a single rounded card: textarea + Model select +
 *     Effort (thinking budget) select + Send / Stop button.
 *
 * File-backed threads live in localStorage (see `useChatThreads`). Each
 * can carry a provider-owned thread ref; switching threads pushes that
 * ref into main so follow-up turns resume that thread's prior context.
 * Untitled chats stay ephemeral and are intentionally not restored.
 */

import type { ChatMessage } from '@contexture/core';
import { type ChatThread, useChatThreads } from '@renderer/chat/useChatThreads';
import type {
  SchemaAgentChatState,
  SchemaAgentModelOptionDescriptor,
} from '@renderer/chat/useSchemaAgentChat';
import { useDocumentStore } from '@renderer/store/document';
import { code } from '@streamdown/code';
import { ArrowUp, BotMessageSquare, List, Square, SquarePen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ChatThreadList } from './ChatThreadList';

export interface ChatPanelProps {
  chat: SchemaAgentChatState;
}

function historyFromThread(thread: ChatThread) {
  return {
    version: '1' as const,
    messages: thread.messages,
    provider: thread.provider,
    ...(thread.model ? { model: thread.model } : {}),
    ...(thread.effort ? { effort: thread.effort } : {}),
    ...(thread.modelOptions ? { modelOptions: thread.modelOptions } : {}),
    ...(thread.providerThreadRef ? { providerThreadRef: thread.providerThreadRef } : {}),
  };
}

export function ChatPanel({ chat }: ChatPanelProps): React.JSX.Element {
  const {
    messages,
    isStreaming,
    liveAssistant,
    authRequired,
    clearAuthRequired,
    send,
    hydrateHistory,
  } = chat;
  const providerLabel = chat.providerLabel;
  const provider = chat.provider;
  const isReady = chat.isReady;
  const model = chat.model;
  const setModel = chat.setModel;
  const thinkingBudget = chat.effort;
  const providerModels = chat.models;
  const modelsLoading = chat.modelsLoading;
  const modelsUnavailable = chat.modelsUnavailable;
  const modelSelectValue =
    model || providerModels[0]?.id || (modelsLoading ? 'models-loading' : 'models-unavailable');
  const activeModel = providerModels.find((option) => option.id === modelSelectValue);
  const modelOptionDescriptors = activeModel?.optionDescriptors ?? [];
  const modelOptionValues = chat.modelOptions;
  const currentModelOptions = chat.modelOptions;
  const unavailableMessage = chat.unavailableMessage;
  const providerThreadRef = chat.providerThreadRef;
  const desynced = chat.desynced;
  const hasUsableModel = providerModels.some((option) => option.id === modelSelectValue);
  const canCompose =
    isReady && !isStreaming && hasUsableModel && !modelsLoading && !modelsUnavailable;

  const filePath = useDocumentStore((s) => s.filePath);
  const history = useChatThreads();
  const {
    activeThreadId,
    createFileThread,
    deleteThread,
    enterDocumentScope,
    getActiveThread,
    markThreadDesynced,
    persistActiveTranscript,
    setShowThreadList,
    showThreadList,
    switchThread,
    threads,
    threadsForFile,
    updateThreadProviderRef,
  } = history;

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Snapshot the last-persisted messages so we don't re-write the
  // active thread for no reason (hydrate from a switch would otherwise
  // trigger a spurious update).
  const prevMessagesRef = useRef<ChatMessage[] | null>(null);

  // Enter the current document's chat scope. The store owns the
  // lifecycle policy: untitled documents stay ephemeral, while
  // file-backed documents restore their active or most-recent thread.
  useEffect(() => {
    const thread = enterDocumentScope(filePath);
    if (!thread) {
      hydrateHistory({ version: '1', messages: [] });
      prevMessagesRef.current = [];
      return;
    }
    hydrateHistory(historyFromThread(thread));
    prevMessagesRef.current = thread.messages;
  }, [filePath, enterDocumentScope, hydrateHistory]);

  // Persist messages into the active file-backed thread whenever they
  // change. Untitled transcripts remain in-memory.
  useEffect(() => {
    if (messages === prevMessagesRef.current) return;
    if (messages.length === 0) return;
    persistActiveTranscript({
      messages,
      provider,
      model,
      effort: thinkingBudget,
      modelOptions: currentModelOptions,
      filePath,
    });
    prevMessagesRef.current = messages;
  }, [
    messages,
    persistActiveTranscript,
    provider,
    model,
    thinkingBudget,
    currentModelOptions,
    filePath,
  ]);

  useEffect(() => {
    if (!activeThreadId) return;
    history.updateThreadSettings(activeThreadId, {
      provider,
      model,
      effort: thinkingBudget,
      modelOptions: currentModelOptions,
    });
  }, [
    activeThreadId,
    history.updateThreadSettings,
    provider,
    model,
    thinkingBudget,
    currentModelOptions,
  ]);

  useEffect(() => {
    if (!providerThreadRef || !activeThreadId) return;
    updateThreadProviderRef(activeThreadId, providerThreadRef);
  }, [providerThreadRef, activeThreadId, updateThreadProviderRef]);

  useEffect(() => {
    if (!desynced || !activeThreadId) return;
    markThreadDesynced(activeThreadId);
  }, [desynced, activeThreadId, markThreadDesynced]);

  const messageCount = messages.length;
  useEffect(() => {
    if (messageCount === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount]);

  const fileThreads = useMemo(
    () => (filePath === null ? [] : threadsForFile(filePath)),
    [threadsForFile, filePath],
  );

  const activeThread = getActiveThread();
  const headerTitle =
    activeThread && activeThread.title !== 'New chat' ? activeThread.title : providerLabel;

  const handleNewChat = useCallback(() => {
    if (filePath === null) {
      enterDocumentScope(null);
      hydrateHistory({ version: '1', messages: [] });
      setInput('');
      prevMessagesRef.current = [];
      setShowThreadList(false);
      return;
    }
    // Don't save empty threads — recycle an already-empty one instead
    // of piling up "New chat" placeholders.
    if (activeThreadId && messages.length === 0) {
      deleteThread(activeThreadId, filePath);
    }
    createFileThread({
      provider,
      model,
      effort: thinkingBudget,
      modelOptions: currentModelOptions,
      filePath,
    });
    hydrateHistory({ version: '1', messages: [] });
    setInput('');
    prevMessagesRef.current = [];
    setShowThreadList(false);
  }, [
    activeThreadId,
    createFileThread,
    deleteThread,
    enterDocumentScope,
    messages.length,
    provider,
    model,
    thinkingBudget,
    filePath,
    hydrateHistory,
    currentModelOptions,
    setShowThreadList,
  ]);

  const handleSwitchThread = useCallback(
    (id: string) => {
      const thread = threads.find((t) => t.id === id);
      if (!thread) return;
      switchThread(id);
      hydrateHistory(historyFromThread(thread));
      prevMessagesRef.current = thread.messages;
    },
    [threads, switchThread, hydrateHistory],
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      const wasActive = id === activeThreadId;
      const next = deleteThread(id, filePath);
      if (!wasActive) return;
      if (next) {
        hydrateHistory(historyFromThread(next));
        prevMessagesRef.current = next.messages;
      } else {
        hydrateHistory({ version: '1', messages: [] });
        prevMessagesRef.current = [];
      }
    },
    [activeThreadId, deleteThread, filePath, hydrateHistory],
  );

  const handleSubmit = useCallback(
    async (ev?: React.FormEvent) => {
      ev?.preventDefault();
      const text = input.trim();
      if (!text || !canCompose) return;
      setInput('');
      await send(text);
    },
    [canCompose, input, send],
  );

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleAbort = useCallback(() => {
    void chat.abort();
  }, [chat]);

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="chat-panel">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={() => setShowThreadList(!showThreadList)}
          title={showThreadList ? 'Hide chat history' : 'Show chat history'}
          data-testid="chat-history-toggle"
        >
          <List className="size-3.5" />
        </Button>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate flex-1">
          {showThreadList ? 'Chat History' : headerTitle}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={handleNewChat}
          title="New chat"
        >
          <SquarePen className="size-3.5" />
        </Button>
      </div>

      {showThreadList ? (
        <ChatThreadList
          threads={fileThreads}
          activeThreadId={activeThreadId}
          onSelect={handleSwitchThread}
          onDelete={handleDeleteThread}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-3" data-testid="chat-transcript">
          {messages.length === 0 && (
            <Empty className="border-0 p-4">
              <EmptyHeader>
                {isReady && (
                  <EmptyMedia variant="icon">
                    <BotMessageSquare />
                  </EmptyMedia>
                )}
                <EmptyTitle className="text-sm font-medium">
                  {isReady
                    ? modelsLoading
                      ? 'Loading models'
                      : modelsUnavailable
                        ? 'No model available'
                        : 'Start a conversation'
                    : 'Not connected'}
                </EmptyTitle>
                <EmptyDescription className="text-xs">
                  {isReady && modelsLoading
                    ? `Loading ${providerLabel} models.`
                    : isReady && modelsUnavailable
                      ? `${providerLabel} did not return any models for this session.`
                      : isReady
                        ? `Describe the schema you want and ${providerLabel} will build it on the canvas.`
                        : (unavailableMessage ?? 'Configure the provider in the toolbar.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isStreaming && liveAssistant.trim().length > 0 && (
            <div
              className="text-sm text-foreground max-w-[95%] leading-relaxed"
              data-testid="chat-message-streaming"
            >
              <Streamdown plugins={{ code }}>{liveAssistant}</Streamdown>
            </div>
          )}
          {isStreaming && (
            <div className="flex gap-1 items-center text-xs text-muted-foreground">
              <span className="animate-pulse">●</span>
              <span>{providerLabel} is thinking…</span>
            </div>
          )}
          {authRequired && (
            <div
              className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded px-2 py-1.5 flex items-center justify-between gap-2"
              data-testid="chat-auth-required"
            >
              <span>Authentication required. Check the auth popover in the toolbar.</span>
              <button
                type="button"
                className="underline hover:opacity-80"
                onClick={clearAuthRequired}
              >
                Dismiss
              </button>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-3 border-t border-border">
        <div
          className={cn(
            'rounded-xl border border-input bg-card transition-shadow',
            'focus-within:ring-1 focus-within:ring-ring',
            (!isReady || isStreaming) && 'opacity-60',
          )}
        >
          <textarea
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isReady ? 'Ask anything…' : 'Configure auth first…'}
            disabled={!canCompose}
            rows={1}
            className={cn(
              'w-full resize-none bg-transparent px-3 pt-3 pb-2 text-sm leading-5',
              'field-sizing-content max-h-[calc(8*1.25rem+1.25rem)]',
              'placeholder:text-muted-foreground focus:outline-none',
              'disabled:cursor-not-allowed overflow-y-auto',
            )}
            data-testid="chat-input"
          />
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <Select value={modelSelectValue} onValueChange={setModel}>
              <SelectTrigger className="w-24 h-7 text-xs border-0 bg-transparent shadow-none focus:ring-0 px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Model</SelectLabel>
                  {modelsLoading ? (
                    <SelectItem value="models-loading" disabled>
                      Loading models
                    </SelectItem>
                  ) : providerModels.length > 0 ? (
                    providerModels.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="models-unavailable" disabled>
                      Models unavailable
                    </SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
            {modelOptionDescriptors.map((descriptor) =>
              descriptor.type === 'select' ? (
                <Select
                  key={descriptor.id}
                  value={resolveSelectValue(
                    descriptor.options,
                    readStringOption(modelOptionValues, descriptor.id),
                  )}
                  onValueChange={(value) => {
                    chat.setModelOption(descriptor.id, value);
                  }}
                >
                  <SelectTrigger
                    aria-label={descriptor.label}
                    title={descriptor.label}
                    className={cn(
                      'h-7 shrink-0 text-xs border-0 bg-transparent shadow-none focus:ring-0 px-1.5',
                      descriptor.id === 'contextWindow' ? 'w-16' : 'w-20',
                    )}
                    data-testid={
                      isEffortDescriptor(descriptor)
                        ? 'chat-effort-select'
                        : `chat-model-option-${descriptor.id}`
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{descriptor.label}</SelectLabel>
                      {descriptor.options.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <div
                  key={descriptor.id}
                  className="flex h-7 shrink-0 items-center gap-1.5 px-1.5 text-xs text-muted-foreground"
                  data-testid={`chat-model-option-${descriptor.id}`}
                >
                  <Checkbox
                    aria-label={descriptor.label}
                    className="size-3.5"
                    checked={readBooleanOption(modelOptionValues, descriptor.id, descriptor)}
                    onCheckedChange={(value) => {
                      chat.setModelOption(descriptor.id, value === true);
                    }}
                  />
                  {descriptor.label}
                </div>
              ),
            )}
            <div className="ml-auto">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleAbort}
                  className="size-7 rounded-lg flex items-center justify-center bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  title="Stop"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canCompose || !input.trim()}
                  className={cn(
                    'size-7 rounded-lg flex items-center justify-center transition-colors',
                    canCompose && input.trim()
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-muted text-muted-foreground cursor-not-allowed',
                  )}
                  title="Send"
                >
                  <ArrowUp className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" data-testid="chat-message-user">
        <div className="bg-primary text-primary-foreground text-sm rounded-lg px-3 py-1.5 max-w-[85%] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  // A tool-use status line looks like a single backticked tool name.
  // Render it as a compact chip
  // rather than a full markdown bubble so the transcript stays readable.
  const isToolStatus = /^`[A-Za-z_][\w-]*`$/.test(message.content);
  if (isToolStatus) {
    return (
      <div
        className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1 font-mono"
        data-testid="chat-message-tool"
      >
        ⚡ {message.content.slice(1, -1)}
      </div>
    );
  }

  return (
    <div
      className="text-sm text-foreground max-w-[95%] leading-relaxed"
      data-testid="chat-message-assistant"
    >
      <Streamdown plugins={{ code }}>{message.content}</Streamdown>
    </div>
  );
}

function resolveSelectValue(
  options: Array<{ id: string; label: string; isDefault?: boolean }>,
  value: string,
): string {
  if (options.some((option) => option.id === value)) return value;
  return options.find((option) => option.isDefault)?.id ?? options[0]?.id ?? '';
}

function isEffortDescriptor(descriptor: SchemaAgentModelOptionDescriptor): boolean {
  return descriptor.id === 'effort' || descriptor.id === 'reasoningEffort';
}

function readStringOption(options: Record<string, string | boolean>, key: string): string {
  const value = options[key];
  return typeof value === 'string' ? value : '';
}

function readBooleanOption(
  options: Record<string, string | boolean>,
  key: string,
  descriptor: Extract<SchemaAgentModelOptionDescriptor, { type: 'boolean' }>,
): boolean {
  const value = options[key];
  return typeof value === 'boolean'
    ? value
    : (descriptor.currentValue ?? descriptor.defaultValue ?? false);
}
