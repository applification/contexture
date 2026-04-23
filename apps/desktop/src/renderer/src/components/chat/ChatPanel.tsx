/**
 * ChatPanel — the Claude chat surface.
 *
 * Mirrors the pre-pivot layout:
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
 * Threads live in localStorage (see `useChatThreads`). Each carries
 * its own Agent SDK `sessionId`; switching threads pushes that id
 * into main so follow-up turns resume that thread's prior context.
 * The chat itself (messages + streaming state + IR push + op
 * dispatch) lives in `useClaudeSchemaChat`. Auth + model + effort
 * live in `useClaude`. The panel stitches them together.
 */

import { useChatThreads } from '@renderer/chat/useChatThreads';
import { type ModelId, type ThinkingBudget, useClaude } from '@renderer/chat/useClaude';
import type { ClaudeSchemaChatState } from '@renderer/chat/useClaudeSchemaChat';
import type { ChatMessage } from '@renderer/model/chat-history';
import { useDocumentStore } from '@renderer/store/document';
import { code } from '@streamdown/code';
import { ArrowUp, BotMessageSquare, List, Square, SquarePen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import { Button } from '@/components/ui/button';
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
  chat: ClaudeSchemaChatState;
}

export function ChatPanel({ chat }: ChatPanelProps): React.JSX.Element {
  const { messages, isStreaming, send, clear, hydrate } = chat;
  const { authMode, isReady, model, setModel, thinkingBudget, setThinkingBudget } = useClaude();

  const filePath = useDocumentStore((s) => s.filePath);
  const history = useChatThreads();

  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track previous filePath so file-change and initial-mount paths
  // behave differently.
  const prevFilePathRef = useRef<string | null | undefined>(undefined);
  // Snapshot the last-persisted messages so we don't re-write the
  // active thread for no reason (hydrate from a switch would otherwise
  // trigger a spurious update).
  const prevMessagesRef = useRef<ChatMessage[] | null>(null);

  // Restore the active thread's messages on first mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once at mount
  useEffect(() => {
    const thread = history.getActiveThread();
    if (thread && thread.messages.length > 0) {
      hydrate(thread.messages);
      // Push the stored session id into main so the next turn resumes
      // this thread's prior SDK context.
      if (thread.sessionId) {
        void window.contexture?.chat?.setSessionId?.(thread.sessionId);
      } else {
        void window.contexture?.chat?.clearSession?.();
      }
    }
    prevMessagesRef.current = thread?.messages ?? [];
  }, []);

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
      prevMessagesRef.current = latest.messages;
      if (latest.sessionId) {
        void window.contexture?.chat?.setSessionId?.(latest.sessionId);
      } else {
        void window.contexture?.chat?.clearSession?.();
      }
    } else {
      history.setActiveThreadId(null);
      clear();
      prevMessagesRef.current = [];
      void window.contexture?.chat?.clearSession?.();
    }
  }, [filePath, history, hydrate, clear]);

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
      const id = history.createThread(model, filePath);
      history.updateThreadMessages(id, messages);
      prevMessagesRef.current = messages;
    }
  }, [messages, history, model, filePath]);

  // Stamp the active thread with the SDK session id as it streams in.
  useEffect(() => {
    const api = window.contexture?.chat;
    if (!api?.onSession) return;
    return api.onSession(({ sessionId }) => {
      if (!sessionId) return;
      const id = history.activeThreadId;
      if (id) history.updateThreadSessionId(id, sessionId);
    });
  }, [history.activeThreadId, history.updateThreadSessionId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the message list changes; biome can't see `messages` is the intended trigger
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-grow the textarea up to a cap so prompts with a few lines
  // don't force the user to scroll a single-line input.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const fileThreads = useMemo(
    () => history.threadsForFile(filePath),
    [history.threadsForFile, filePath],
  );

  const activeThread = history.getActiveThread();
  const headerTitle =
    activeThread && activeThread.title !== 'New chat' ? activeThread.title : 'Claude';

  const handleNewChat = useCallback(() => {
    // Don't save empty threads — recycle an already-empty one instead
    // of piling up "New chat" placeholders.
    if (history.activeThreadId && messages.length === 0) {
      history.deleteThread(history.activeThreadId);
    }
    history.createThread(model, filePath);
    clear();
    setInput('');
    prevMessagesRef.current = [];
    // Drop main's resume id so the SDK starts a brand-new session on
    // the next turn.
    void window.contexture?.chat?.clearSession?.();
    history.setShowThreadList(false);
  }, [history, messages.length, model, filePath, clear]);

  const handleSwitchThread = useCallback(
    (id: string) => {
      const thread = history.threads.find((t) => t.id === id);
      if (!thread) return;
      history.switchThread(id);
      hydrate(thread.messages);
      prevMessagesRef.current = thread.messages;
      if (thread.sessionId) {
        void window.contexture?.chat?.setSessionId?.(thread.sessionId);
      } else {
        void window.contexture?.chat?.clearSession?.();
      }
    },
    [history, hydrate],
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
        history.setActiveThreadId(next.id);
        prevMessagesRef.current = next.messages;
        if (next.sessionId) void window.contexture?.chat?.setSessionId?.(next.sessionId);
        else void window.contexture?.chat?.clearSession?.();
      } else {
        clear();
        prevMessagesRef.current = [];
        void window.contexture?.chat?.clearSession?.();
      }
    },
    [history, filePath, hydrate, clear],
  );

  const handleSubmit = useCallback(
    async (ev?: React.FormEvent) => {
      ev?.preventDefault();
      const text = input.trim();
      if (!text || isStreaming || !isReady) return;
      setInput('');
      await send(text);
    },
    [input, isStreaming, isReady, send],
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
    void window.contexture?.chat?.abort?.();
  }, []);

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
                  {isReady ? 'Start a conversation' : 'Not connected'}
                </EmptyTitle>
                <EmptyDescription className="text-xs">
                  {isReady
                    ? 'Describe the schema you want — "add a Plot type with a name and location" — and Claude will build it on the canvas.'
                    : authMode === 'max'
                      ? 'Claude CLI not detected. Configure in toolbar.'
                      : 'Set your API key in the toolbar to start chatting.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isStreaming && (
            <div className="flex gap-1 items-center text-xs text-muted-foreground">
              <span className="animate-pulse">●</span>
              <span>Claude is thinking…</span>
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
            ref={textareaRef}
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isReady ? 'Ask anything…' : 'Configure auth first…'}
            disabled={!isReady || isStreaming}
            rows={1}
            className={cn(
              'w-full resize-none bg-transparent px-3 pt-3 pb-2 text-sm',
              'placeholder:text-muted-foreground focus:outline-none',
              'disabled:cursor-not-allowed max-h-32 overflow-y-auto',
            )}
            data-testid="chat-input"
          />
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <Select value={model} onValueChange={(v) => setModel(v as ModelId)}>
              <SelectTrigger className="w-24 h-7 text-xs border-0 bg-transparent shadow-none focus:ring-0 px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Model</SelectLabel>
                  <SelectItem value="claude-haiku-4-5-20251001">Haiku</SelectItem>
                  <SelectItem value="claude-sonnet-4-6">Sonnet</SelectItem>
                  <SelectItem value="claude-opus-4-6">Opus</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={thinkingBudget}
              onValueChange={(v) => setThinkingBudget(v as ThinkingBudget)}
            >
              <SelectTrigger className="w-20 h-7 text-xs border-0 bg-transparent shadow-none focus:ring-0 px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Effort</SelectLabel>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="med">Med</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
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
                  disabled={!isReady || !input.trim()}
                  className={cn(
                    'size-7 rounded-lg flex items-center justify-center transition-colors',
                    isReady && input.trim()
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

  // A tool-use status line looks like a single backticked tool name
  // (see `useClaudeSchemaChat.onToolUse`). Render it as a compact chip
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
