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
 *   - Prompt input as a docked rounded surface: recent agent turn summary
 *     (when present) + textarea + Model select + Effort (thinking budget)
 *     select + Send / Stop button.
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
  hashAgentTurnSchema,
  summarizeAgentTurnSchemaDiff,
} from '@contexture/core/agent-turn-ledger';
import { type ChatThread, useChatThreads } from '@renderer/chat/useChatThreads';
import type {
  ChatContextAttachment,
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
  ChevronRight,
  Clock3,
  File,
  FileText,
  Image,
  List,
  Plus,
  RotateCcw,
  Square,
  SquarePen,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import { Badge } from '@/components/ui/badge';
import { BorderBeam } from '@/components/ui/border-beam';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const [attachments, setAttachments] = useState<ChatContextAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [responsePending, setResponsePending] = useState(false);
  const isWaitingForFinalResponse = responsePending || isStreaming;
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

  useEffect(() => {
    if (!isStreaming) setResponsePending(false);
  }, [isStreaming]);

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
      const turnAttachments = attachments;
      setAttachments([]);
      setAttachmentError(null);
      setResponsePending(true);
      try {
        await send(text, turnAttachments);
      } finally {
        setResponsePending(false);
      }
    },
    [attachments, canCompose, input, send],
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

  const handleAttachFiles = useCallback(async (kind: 'photos' | 'files') => {
    setAttachmentError(null);
    try {
      const picked = await window.contexture.file.pickChatContextFiles(kind);
      if (picked.length === 0) return;
      setAttachments((current) => {
        const byPath = new Map(current.map((attachment) => [attachment.path, attachment]));
        for (const attachment of picked) byPath.set(attachment.path, attachment);
        return [...byPath.values()];
      });
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }, []);

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
        <div className="flex-1 overflow-y-auto p-3 pb-2 space-y-3" data-testid="chat-transcript">
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
          {messages.filter(isVisibleTranscriptMessage).map((m) => (
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

      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-border"
        data-testid="chat-composer"
      >
        {recentAgentTurn && (
          <div className="-mb-px px-2" data-testid="agent-turn-dock">
            <AgentTurnSummaryCard
              turn={recentAgentTurn}
              isWaitingForFinalResponse={isWaitingForFinalResponse}
              docked
            />
          </div>
        )}
        <div
          className={cn(
            'relative rounded-xl border border-input bg-card transition-shadow',
            recentAgentTurn && 'rounded-t-lg',
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
          {(attachments.length > 0 || attachmentError) && (
            <div className="flex flex-wrap gap-1.5 px-2 pb-1">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/60 px-1.5 text-xs text-muted-foreground"
                  data-testid="chat-attachment-chip"
                  title={attachment.path}
                >
                  <FileText className="size-3 shrink-0" />
                  <span className="max-w-40 truncate">{attachment.name}</span>
                  {attachment.truncated && <span className="text-[10px]">trimmed</span>}
                  <button
                    type="button"
                    className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {attachmentError && (
                <span className="text-xs text-destructive" data-testid="chat-attachment-error">
                  {attachmentError}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={!canCompose}
                  className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  title="Add context"
                  aria-label="Add context"
                  data-testid="chat-add-context"
                >
                  <Plus className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-48">
                <DropdownMenuItem
                  onSelect={() => void handleAttachFiles('photos')}
                  data-testid="chat-add-photos"
                >
                  <Image className="size-4" />
                  Add photos
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void handleAttachFiles('files')}
                  data-testid="chat-add-files"
                >
                  <File className="size-4" />
                  Add files
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

function AgentTurnSummaryCard({
  turn,
  isWaitingForFinalResponse,
  docked = false,
}: {
  turn: AgentTurnRecord;
  isWaitingForFinalResponse: boolean;
  docked?: boolean;
}): React.JSX.Element {
  const applied = turn.ops.filter((op) => op.status === 'applied').length;
  const rejected = turn.ops.filter((op) => op.status === 'rejected').length;
  const pending =
    turn.status === 'running' ? turn.ops.filter((op) => op.status === 'pending').length : 0;
  const diffRows = summarizeAgentTurnSchemaDiff(diffAgentTurnSchema(turn.before, turn.after));
  const toolSummary = summarizeTurnTools(turn.ops);
  const toolCount = turn.ops.length;
  const canUndo = useUndoStore((s) => s.canUndo);
  const undo = useUndoStore((s) => s.undo);
  const schema = useUndoStore((s) => s.schema);
  const markRolledBack = useAgentTurnsStore((s) => s.markRolledBack);
  const canUndoTurn =
    turn.status === 'committed' &&
    applied > 0 &&
    canUndo &&
    !!turn.afterHash &&
    hashAgentTurnSchema(schema) === turn.afterHash;
  const handleUndo = useCallback(() => {
    if (!canUndoTurn) return;
    undo();
    markRolledBack(turn.id);
  }, [canUndoTurn, markRolledBack, turn.id, undo]);

  const [expanded, setExpanded] = useState(false);
  const detailId = useId();

  return (
    <div className="w-full" data-testid="agent-turn-pane">
      <button
        type="button"
        className={cn(
          'relative w-full overflow-hidden border border-border/70 bg-card px-3 py-3 text-left text-xs text-muted-foreground shadow-sm transition-colors',
          'hover:border-primary/30 hover:bg-accent/35 focus:outline-none focus:ring-1 focus:ring-ring',
          docked && expanded && 'rounded-t-xl rounded-b-none border-b-border/70',
          docked && !expanded && 'rounded-t-xl rounded-b-none border-b-input',
          !docked && expanded && 'rounded-t-lg rounded-b-none',
          !docked && !expanded && 'rounded-lg',
        )}
        data-testid="agent-turn-summary"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((current) => !current)}
      >
        {isWaitingForFinalResponse && (
          <span data-testid="agent-turn-pending-highlight">
            <BorderBeam duration={6} size={100} />
          </span>
        )}
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary">
            <Wrench className="size-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
                {turn.summary}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {turn.status === 'committed' && applied > 0 && (
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                )}
                {turn.status === 'rolled_back' && (
                  <RotateCcw className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <ChevronRight
                  className={cn(
                    'size-3.5 text-muted-foreground transition-transform',
                    expanded && 'rotate-90',
                  )}
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="h-5 px-1.5 py-0 text-[11px] font-medium">
                {turnStatusLabel(turn.status)}
              </Badge>
              {toolCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 py-0 text-[11px] font-medium">
                  {toolCount} tool {toolCount === 1 ? 'call' : 'calls'}
                </Badge>
              )}
              <Badge variant="outline" className="h-5 px-1.5 py-0 text-[11px] font-medium">
                {applied} applied
              </Badge>
              {rejected > 0 && (
                <Badge
                  variant="outline"
                  className="h-5 border-destructive/30 px-1.5 py-0 text-[11px] font-medium text-destructive"
                >
                  {rejected} rejected
                </Badge>
              )}
              {pending > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 py-0 text-[11px] font-medium">
                  {pending} pending
                </Badge>
              )}
            </div>
            <div className="mt-2 grid gap-1.5">
              {toolSummary && (
                <div
                  className="flex min-w-0 items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
                  data-testid="agent-turn-tool-summary"
                >
                  <Wrench className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate font-mono">{toolSummary}</span>
                </div>
              )}
              {diffRows.length > 0 && (
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CheckCircle2 className="size-3 shrink-0 text-success" aria-hidden="true" />
                  <span className="truncate">{diffRows.slice(0, 2).join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
      {expanded && (
        <section
          id={detailId}
          className={cn(
            'max-h-96 overflow-y-auto border-x border-b border-border/70 bg-card',
            docked ? 'rounded-b-none' : 'rounded-b-lg',
          )}
          aria-label="Agent turn details"
          data-testid="agent-turn-detail"
        >
          <AgentTurnDetail turn={turn} canUndo={canUndoTurn} onUndo={handleUndo} />
        </section>
      )}
    </div>
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

function summarizeTurnTools(ops: AgentTurnOpResult[]): string | null {
  if (ops.length === 0) return null;
  const counts = new Map<string, number>();
  for (const op of ops) counts.set(op.name, (counts.get(op.name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => (count === 1 ? name : `${name} x${count}`))
    .join(', ');
}

function isToolStatusMessage(message: ChatMessage): boolean {
  return message.role === 'assistant' && /^`[A-Za-z_][\w-]*`$/.test(message.content);
}

function isVisibleTranscriptMessage(message: ChatMessage): boolean {
  return !isToolStatusMessage(message);
}

function MessageBubble({ message }: { message: ChatMessage }): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" data-testid="chat-message-user">
        <div className="bg-primary text-primary-foreground text-sm rounded-lg px-3 py-1.5 max-w-[85%]">
          <div className="whitespace-pre-wrap">{message.content}</div>
          {message.contextAttachments && message.contextAttachments.length > 0 && (
            <div
              className="mt-2 flex flex-wrap justify-end gap-1.5"
              data-testid="chat-message-context-attachments"
            >
              {message.contextAttachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-primary-foreground/25 bg-primary-foreground/10 px-1.5 text-xs text-primary-foreground/85"
                  title={attachment.path}
                >
                  <FileText className="size-3 shrink-0" aria-hidden="true" />
                  <span className="max-w-40 truncate">{attachment.name}</span>
                  {attachment.truncated && <span className="text-[10px]">trimmed</span>}
                </span>
              ))}
            </div>
          )}
        </div>
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
