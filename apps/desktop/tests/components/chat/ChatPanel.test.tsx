/**
 * ChatPanel — minimal rendering + submit behaviour over the injected
 * chat state. No real hook or preload surface is involved.
 */

import type { ClaudeSchemaChatState } from '@renderer/chat/useClaudeSchemaChat';
import { ChatPanel } from '@renderer/components/chat/ChatPanel';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeChat(overrides: Partial<ClaudeSchemaChatState> = {}): ClaudeSchemaChatState {
  return {
    messages: [],
    isStreaming: false,
    send: vi.fn().mockResolvedValue(undefined),
    hydrate: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

describe('ChatPanel', () => {
  afterEach(cleanup);

  it('renders empty-state copy when there are no messages', () => {
    render(<ChatPanel chat={makeChat()} />);
    expect(screen.getByText(/Start a chat/i)).toBeInTheDocument();
  });

  it('renders user + assistant messages', () => {
    const chat = makeChat({
      messages: [
        { id: 'u', role: 'user', content: 'add a Plot type', createdAt: 1 },
        { id: 'a', role: 'assistant', content: 'Done.', createdAt: 2 },
      ],
    });
    render(<ChatPanel chat={chat} />);
    expect(screen.getByTestId('chat-message-user')).toHaveTextContent('add a Plot type');
    expect(screen.getByTestId('chat-message-assistant')).toHaveTextContent('Done.');
  });

  it('shows streaming indicator while isStreaming is true', () => {
    render(<ChatPanel chat={makeChat({ isStreaming: true })} />);
    expect(screen.getByTestId('chat-streaming')).toBeInTheDocument();
  });

  it('Cmd+Enter in the textarea calls chat.send with the trimmed draft', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<ChatPanel chat={makeChat({ send })} />);
    const textarea = screen.getByTestId('chat-input');
    fireEvent.change(textarea, { target: { value: '  hello  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(send).toHaveBeenCalledWith('hello');
  });

  it('Send button is disabled while streaming or when the draft is empty', () => {
    const { rerender } = render(<ChatPanel chat={makeChat()} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    rerender(<ChatPanel chat={makeChat({ isStreaming: true })} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
