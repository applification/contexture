/**
 * ChatPanel — the Claude chat surface.
 *
 * Mirrors the pre-pivot layout:
 *   - Header with a "New chat" button that clears the transcript.
 *   - Empty state (BotMessageSquare) when there are no messages, with
 *     auth-aware copy ("Not connected" if the toolbar popover hasn't
 *     been configured).
 *   - Message list rendered as user bubbles (right-aligned primary),
 *     tool-use status lines (small monospace chips), and assistant
 *     markdown via `Streamdown`.
 *   - Prompt input as a single rounded card: textarea + Model select +
 *     Effort (thinking budget) select + Send / Stop button.
 *
 * The chat itself (messages + streaming state + IR push + op dispatch)
 * lives in `useClaudeSchemaChat`. Auth + model + effort live in
 * `useClaude`. The panel just stitches them together.
 *
 * Thread list, file-context badge, and selection-aware context
 * injection from the pre-pivot ChatPanel aren't ported yet — those
 * depend on IR-side plumbing we don't have (e.g. chat threads keyed by
 * schema file, node-selection → context string). Slice Chat v2 can
 * layer them on top.
 */

import { type ModelId, type ThinkingBudget, useClaude } from '@renderer/chat/useClaude';
import type { ClaudeSchemaChatState } from '@renderer/chat/useClaudeSchemaChat';
import type { ChatMessage } from '@renderer/model/chat-history';
import { code } from '@streamdown/code';
import { ArrowUp, BotMessageSquare, Square, SquarePen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

export interface ChatPanelProps {
  chat: ClaudeSchemaChatState;
}

export function ChatPanel({ chat }: ChatPanelProps): React.JSX.Element {
  const { messages, isStreaming, send, clear } = chat;
  const { authMode, isReady, model, setModel, thinkingBudget, setThinkingBudget } = useClaude();

  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleNewChat = useCallback(() => {
    clear();
    setInput('');
    // The server-side Agent SDK session is ephemeral per `query()` call,
    // so there's nothing extra to reset here — clearing the transcript
    // is enough.
  }, [clear]);

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
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">
          Claude
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
