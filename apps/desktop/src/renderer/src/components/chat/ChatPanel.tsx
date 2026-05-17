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
 * Threads live in localStorage (see `useChatThreads`). Each can carry
 * a provider-owned thread ref; switching threads pushes that ref into
 * main so follow-up turns resume that thread's prior context.
 */

import { type ChatThread, useChatThreads } from '@renderer/chat/useChatThreads';
import type {
  SchemaAgentChatState,
  SchemaAgentModelOptionDescriptor,
} from '@renderer/chat/useSchemaAgentChat';
import type { ChatMessage } from '@renderer/model/chat-history';
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

export function ChatPanel({ chat }: ChatPanelProps): React.JSX.Element {
  const {
    messages,
    isStreaming,
    liveAssistant,
    authRequired,
    clearAuthRequired,
    send,
    clear,
    hydrate,
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

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track previous filePath so file-change and initial-mount paths
  // behave differently.
  const prevFilePathRef = useRef<string | null | undefined>(undefined);
  // Snapshot the last-persisted messages so we don't re-write the
  // active thread for no reason (hydrate from a switch would otherwise
  // trigger a spurious update).
  const prevMessagesRef = useRef<ChatMessage[] | null>(null);

  const restoreThreadSettings = useCallback(
    (thread: ChatThread) => {
      chat.restoreSettings({
        provider: thread.provider,
        model: thread.model,
        effort: thread.effort,
        modelOptions: thread.modelOptions,
      });
    },
    [chat.restoreSettings],
  );

  // Restore the active thread's messages on first mount.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const thread = history.getActiveThread();
    if (thread) {
      if (thread.messages.length > 0) hydrate(thread.messages);
      restoreThreadSettings(thread);
      if (thread.providerThreadRef)
        void window.contexture?.schemaAgent?.threadSet(thread.providerThreadRef);
      else void window.contexture?.schemaAgent?.threadClear();
    }
    prevMessagesRef.current = thread?.messages ?? [];
  }, [history, hydrate, restoreThreadSettings]);

  // On schema-file change, switch to the most recent thread for that
  // file — or clear the transcript and the SDK session if this file
  // has no prior threads yet.
  useEffect(() => {
    if (prevFilePathRef.current === undefined) {
      // First render — handled by the restore effect above.
      prevFilePathRef.current = filePath;
      return;
    }
    if (prevFilePathRef.current === filePath) return;
    prevFilePathRef.current = filePath;

    const fileThreads = history.threadsForFile(filePath);
    if (fileThreads.length > 0) {
      const latest = fileThreads[0];
      history.switchThread(latest.id);
      hydrate(latest.messages);
      restoreThreadSettings(latest);
      prevMessagesRef.current = latest.messages;
      if (latest.providerThreadRef) {
        void window.contexture?.schemaAgent?.threadSet(latest.providerThreadRef);
      } else {
        void window.contexture?.schemaAgent?.threadClear();
      }
    } else {
      history.setActiveThreadId(null);
      clear();
      prevMessagesRef.current = [];
      void window.contexture?.schemaAgent?.threadClear();
    }
  }, [filePath, history, hydrate, clear, restoreThreadSettings]);

  // Persist messages into the active thread whenever they change.
  useEffect(() => {
    if (!history.activeThreadId) return;
    if (messages === prevMessagesRef.current) return;
    if (messages.length === 0) return;
    history.updateThreadMessages(history.activeThreadId, messages);
    prevMessagesRef.current = messages;
  }, [messages, history.activeThreadId, history.updateThreadMessages]);

  // Auto-create a thread on the first appended message if none active.
  useEffect(() => {
    if (!history.activeThreadId && messages.length > 0) {
      const id = history.createThread({
        provider,
        model,
        effort: thinkingBudget,
        modelOptions: currentModelOptions,
        filePath,
      });
      history.updateThreadMessages(id, messages);
      prevMessagesRef.current = messages;
    }
  }, [messages, history, model, thinkingBudget, filePath, provider, currentModelOptions]);

  useEffect(() => {
    if (!history.activeThreadId) return;
    history.updateThreadSettings(history.activeThreadId, {
      provider,
      model,
      effort: thinkingBudget,
      modelOptions: currentModelOptions,
    });
  }, [
    history.activeThreadId,
    history.updateThreadSettings,
    provider,
    model,
    thinkingBudget,
    currentModelOptions,
  ]);

  useEffect(() => {
    if (!providerThreadRef || !history.activeThreadId) return;
    history.updateThreadProviderRef(history.activeThreadId, providerThreadRef);
  }, [providerThreadRef, history.activeThreadId, history.updateThreadProviderRef]);

  useEffect(() => {
    if (!desynced || !history.activeThreadId) return;
    history.markThreadDesynced(history.activeThreadId);
  }, [desynced, history.activeThreadId, history.markThreadDesynced]);

  const messageCount = messages.length;
  useEffect(() => {
    if (messageCount === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount]);

  const fileThreads = useMemo(
    () => history.threadsForFile(filePath),
    [history.threadsForFile, filePath],
  );

  const activeThread = history.getActiveThread();
  const headerTitle =
    activeThread && activeThread.title !== 'New chat' ? activeThread.title : providerLabel;

  const handleNewChat = useCallback(() => {
    // Don't save empty threads — recycle an already-empty one instead
    // of piling up "New chat" placeholders.
    if (history.activeThreadId && messages.length === 0) {
      history.deleteThread(history.activeThreadId);
    }
    history.createThread({
      provider,
      model,
      effort: thinkingBudget,
      modelOptions: currentModelOptions,
      filePath,
    });
    clear();
    setInput('');
    prevMessagesRef.current = [];
    void window.contexture?.schemaAgent?.threadClear();
    history.setShowThreadList(false);
  }, [
    history,
    messages.length,
    provider,
    model,
    thinkingBudget,
    filePath,
    clear,
    currentModelOptions,
  ]);

  const handleSwitchThread = useCallback(
    (id: string) => {
      const thread = history.threads.find((t) => t.id === id);
      if (!thread) return;
      history.switchThread(id);
      hydrate(thread.messages);
      restoreThreadSettings(thread);
      prevMessagesRef.current = thread.messages;
      if (thread.providerThreadRef)
        void window.contexture?.schemaAgent?.threadSet(thread.providerThreadRef);
      else void window.contexture?.schemaAgent?.threadClear();
    },
    [history, hydrate, restoreThreadSettings],
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      const wasActive = id === history.activeThreadId;
      history.deleteThread(id);
      if (!wasActive) return;
      // Pick the next most-recent thread for the same file; fall back
      // to an empty transcript + cleared session if none remain.
      const remaining = history.threadsForFile(filePath).filter((t) => t.id !== id);
      if (remaining.length > 0) {
        const next = remaining[0];
        hydrate(next.messages);
        restoreThreadSettings(next);
        history.setActiveThreadId(next.id);
        prevMessagesRef.current = next.messages;
        if (next.providerThreadRef)
          void window.contexture?.schemaAgent?.threadSet(next.providerThreadRef);
        else void window.contexture?.schemaAgent?.threadClear();
      } else {
        clear();
        prevMessagesRef.current = [];
        void window.contexture?.schemaAgent?.threadClear();
      }
    },
    [history, filePath, hydrate, clear, restoreThreadSettings],
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
          onClick={() => history.setShowThreadList(!history.showThreadList)}
          title={history.showThreadList ? 'Hide chat history' : 'Show chat history'}
          data-testid="chat-history-toggle"
        >
          <List className="size-3.5" />
        </Button>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate flex-1">
          {history.showThreadList ? 'Chat History' : headerTitle}
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

      {history.showThreadList ? (
        <ChatThreadList
          threads={fileThreads}
          activeThreadId={history.activeThreadId}
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
