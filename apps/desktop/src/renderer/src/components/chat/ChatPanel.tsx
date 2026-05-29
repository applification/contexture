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
import {
  type AgentTurnOpResult,
  type AgentTurnRecord,
  describeAgentTurnOp,
  diffAgentTurnSchema,
  summarizeAgentTurnSchemaDiff,
} from '@contexture/core/agent-turn-ledger';
import { type ChatThread, useChatThreads } from '@renderer/chat/useChatThreads';
import type {
  SchemaAgentChatState,
  SchemaAgentModelOptionDescriptor,
} from '@renderer/chat/useSchemaAgentChat';
import { useAgentTurnsStore } from '@renderer/store/agent-turns';
import { useDocumentStore } from '@renderer/store/document';
import { useUndoStore } from '@renderer/store/undo';
import { code } from '@streamdown/code';
import {
  ArrowUp,
  BotMessageSquare,
  CheckCircle2,
  Clock3,
  List,
  RotateCcw,
  Square,
  SquarePen,
  XCircle,
} from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
    ...(thread.agentTurns ? { agentTurns: thread.agentTurns } : {}),
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
  const recentAgentTurn = useAgentTurnsStore((s) => s.turns[0] ?? null);
  const agentTurns = useAgentTurnsStore((s) => s.turns);
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
  const prevAgentTurnsRef = useRef<AgentTurnRecord[] | null>(null);

  // Enter the current document's chat scope. The store owns the
  // lifecycle policy: untitled documents stay ephemeral, while
  // file-backed documents restore their active or most-recent thread.
  useEffect(() => {
    const thread = enterDocumentScope(filePath);
    if (!thread) {
      hydrateHistory({ version: '1', messages: [] });
      prevMessagesRef.current = [];
      prevAgentTurnsRef.current = [];
      return;
    }
    hydrateHistory(historyFromThread(thread));
    prevMessagesRef.current = thread.messages;
    prevAgentTurnsRef.current = thread.agentTurns ?? [];
  }, [filePath, enterDocumentScope, hydrateHistory]);

  // Persist messages into the active file-backed thread whenever they
  // change. Untitled transcripts remain in-memory.
  useEffect(() => {
    if (messages === prevMessagesRef.current && agentTurns === prevAgentTurnsRef.current) return;
    if (messages.length === 0) return;
    persistActiveTranscript({
      messages,
      provider,
      model,
      effort: thinkingBudget,
      modelOptions: currentModelOptions,
      agentTurns,
      filePath,
    });
    prevMessagesRef.current = messages;
    prevAgentTurnsRef.current = agentTurns;
  }, [
    messages,
    persistActiveTranscript,
    provider,
    model,
    thinkingBudget,
    currentModelOptions,
    agentTurns,
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
      prevAgentTurnsRef.current = [];
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
    prevAgentTurnsRef.current = [];
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
      prevAgentTurnsRef.current = thread.agentTurns ?? [];
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
        prevAgentTurnsRef.current = next.agentTurns ?? [];
      } else {
        hydrateHistory({ version: '1', messages: [] });
        prevMessagesRef.current = [];
        prevAgentTurnsRef.current = [];
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
          {recentAgentTurn && <AgentTurnSummaryCard turn={recentAgentTurn} />}
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

function AgentTurnSummaryCard({ turn }: { turn: AgentTurnRecord }): React.JSX.Element {
  const applied = turn.ops.filter((op) => op.status === 'applied').length;
  const rejected = turn.ops.filter((op) => op.status === 'rejected').length;
  const pending =
    turn.status === 'running' ? turn.ops.filter((op) => op.status === 'pending').length : 0;
  const diffRows = summarizeAgentTurnSchemaDiff(diffAgentTurnSchema(turn.before, turn.after));
  const canUndo = useUndoStore((s) => s.canUndo);
  const undo = useUndoStore((s) => s.undo);
  const markRolledBack = useAgentTurnsStore((s) => s.markRolledBack);
  const handleUndo = useCallback(() => {
    undo();
    markRolledBack(turn.id);
  }, [markRolledBack, turn.id, undo]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full rounded-md border border-border/70 bg-card/70 px-2.5 py-2 text-left text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-ring"
          data-testid="agent-turn-summary"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{turn.summary}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <AgentTurnMetaPill>{turnStatusLabel(turn.status)}</AgentTurnMetaPill>
                <span>{applied} applied</span>
                {rejected > 0 && <span className="text-destructive">{rejected} rejected</span>}
                {pending > 0 && <span>{pending} pending</span>}
              </div>
              {diffRows.length > 0 && (
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {diffRows.slice(0, 2).join(', ')}
                </div>
              )}
            </div>
            {turn.status === 'committed' && applied > 0 && (
              <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden="true" />
            )}
            {turn.status === 'rolled_back' && (
              <RotateCcw className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <AgentTurnDetail
          turn={turn}
          canUndo={turn.status === 'committed' && applied > 0 && canUndo}
          onUndo={handleUndo}
        />
      </PopoverContent>
    </Popover>
  );
}

function AgentTurnDetail({
  turn,
  canUndo,
  onUndo,
}: {
  turn: AgentTurnRecord;
  canUndo: boolean;
  onUndo: () => void;
}): React.JSX.Element {
  const diffRows = summarizeAgentTurnSchemaDiff(diffAgentTurnSchema(turn.before, turn.after));
  const visibleOps = turn.ops.filter((op) => op.status !== 'pending' || turn.status === 'running');
  const hiddenPending = turn.ops.length - visibleOps.length;
  return (
    <div className="max-h-96 overflow-y-auto text-xs">
      <div className="border-b border-border/70 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground">{turn.summary}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {turn.provider ?? 'Agent'}
              {turn.model ? ` · ${turn.model}` : ''} · {turnStatusLabel(turn.status)}
            </div>
          </div>
          {canUndo && (
            <button
              type="button"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/70 px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              onClick={onUndo}
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Undo turn
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        {diffRows.length > 0 && (
          <div className="rounded-md border border-primary/15 bg-primary/5 px-2 py-1.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Schema diff
            </div>
            <ul className="space-y-0.5">
              {diffRows.map((row) => (
                <li key={row} className="text-[11px] leading-5 text-foreground">
                  {row}
                </li>
              ))}
            </ul>
          </div>
        )}
        {visibleOps.length === 0 ? (
          <div className="text-muted-foreground">No model operations recorded yet.</div>
        ) : (
          <details>
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tool log
            </summary>
            <div className="mt-1 overflow-hidden rounded-md border border-border/70">
              {visibleOps.map((op) => (
                <AgentTurnOpRow key={op.id} op={op} />
              ))}
            </div>
          </details>
        )}
        {hiddenPending > 0 && (
          <div className="text-[11px] text-muted-foreground">
            {hiddenPending} provisional tool {hiddenPending === 1 ? 'call was' : 'calls were'}{' '}
            resolved by the applied operations above.
          </div>
        )}
      </div>
      <details className="border-t border-border/70 px-3 py-2">
        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Raw turn record
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 text-[10px]">
          {JSON.stringify(turn, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function AgentTurnOpRow({ op }: { op: AgentTurnOpResult }): React.JSX.Element {
  return (
    <div className="border-b border-border/60 bg-background px-2.5 py-1.5 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium leading-5 text-foreground">
            {describeAgentTurnOp(op)}
          </div>
          <div className="font-mono text-[10px] leading-4 text-muted-foreground">{op.name}</div>
        </div>
        <AgentTurnStatusPill status={op.status} />
      </div>
      {op.error && (
        <div className="mt-1 whitespace-pre-wrap text-[11px] text-destructive">{op.error}</div>
      )}
    </div>
  );
}

function AgentTurnMetaPill({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="rounded-full border border-border/70 bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function AgentTurnStatusPill({
  status,
}: {
  status: AgentTurnOpResult['status'];
}): React.JSX.Element {
  const iconClass = 'size-3';
  const content =
    status === 'applied'
      ? {
          label: 'Applied',
          icon: CheckCircle2,
          className: 'border-success/30 bg-success/10 text-success',
        }
      : status === 'rejected'
        ? {
            label: 'Rejected',
            icon: XCircle,
            className: 'border-destructive/30 bg-destructive/10 text-destructive',
          }
        : status === 'pending'
          ? {
              label: 'Pending',
              icon: Clock3,
              className: 'border-border/70 bg-muted/60 text-muted-foreground',
            }
          : {
              label: 'Tool',
              icon: Clock3,
              className: 'border-border/70 bg-muted/60 text-muted-foreground',
            };
  const Icon = content.icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        content.className,
      )}
    >
      <Icon className={iconClass} aria-hidden="true" />
      {content.label}
    </span>
  );
}

function turnStatusLabel(status: AgentTurnRecord['status']): string {
  if (status === 'running') return 'running';
  if (status === 'rolled_back') return 'rolled back';
  return 'reviewable';
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
