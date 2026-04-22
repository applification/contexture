/**
 * ChatPanel — a minimal chat surface sitting on top of
 * `useClaudeSchemaChat`.
 *
 * Responsibilities:
 *   - Render the transcript from the hook's `messages` list.
 *   - Provide a multi-line input that submits on Cmd/Ctrl+Enter.
 *   - Show a "thinking" indicator while `isStreaming` is true.
 *   - Render nothing from the pre-pivot (legacy) surface.
 *
 * The hook is injected so tests (and Storybook) can drive the panel
 * without a real preload bridge.
 */
import { useState } from 'react';
import type { ClaudeSchemaChatState } from '../../chat/useClaudeSchemaChat';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

export interface ChatPanelProps {
  chat: ClaudeSchemaChatState;
}

export function ChatPanel({ chat }: ChatPanelProps) {
  const [draft, setDraft] = useState('');

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await chat.send(text);
  };

  return (
    <div className="flex h-full flex-col" data-testid="chat-panel">
      <div className="flex-1 space-y-2 overflow-y-auto p-3" data-testid="chat-transcript">
        {chat.messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Start a chat to describe the schema you want.
          </p>
        )}
        {chat.messages.map((m) => (
          <div
            key={m.id}
            data-testid={`chat-message-${m.role}`}
            className={
              m.role === 'user'
                ? 'rounded border border-border bg-muted/40 p-2 text-sm'
                : 'rounded p-2 text-sm'
            }
          >
            <div className="mb-1 text-[10px] uppercase text-muted-foreground">{m.role}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {chat.isStreaming && (
          <p className="text-xs text-muted-foreground" data-testid="chat-streaming">
            Thinking…
          </p>
        )}
      </div>
      <div className="border-t border-border p-2">
        <Textarea
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
              ev.preventDefault();
              submit();
            }
          }}
          placeholder="Describe a type to add, e.g. “add a Plot type with a name and location”"
          rows={3}
          data-testid="chat-input"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            type="button"
            onClick={submit}
            disabled={chat.isStreaming || draft.trim() === ''}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
