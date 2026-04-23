/**
 * ChatPanel — minimal rendering + submit behaviour over the injected
 * chat state. `useClaude` is a dependency; we mock the preload bridge
 * so it reports a ready Max session by default, which lets the input
 * accept typing. Tests that want the "not connected" path construct
 * the bridge with `{ installed: false }`.
 */

import type { ClaudeSchemaChatState } from '@renderer/chat/useClaudeSchemaChat';
import { ChatPanel } from '@renderer/components/chat/ChatPanel';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeChat(overrides: Partial<ClaudeSchemaChatState> = {}): ClaudeSchemaChatState {
  return {
    messages: [],
    isStreaming: false,
    liveAssistant: '',
    authRequired: false,
    clearAuthRequired: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    hydrate: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

function mockBridge(installed: boolean): void {
  (window as unknown as { contexture: unknown }).contexture = {
    chat: {
      detectClaudeCli: vi.fn(async () => ({
        installed,
        path: installed ? '/usr/local/bin/claude' : null,
      })),
      setAuth: vi.fn(async () => ({ ok: true })),
      setModelOptions: vi.fn(async () => ({ ok: true })),
      abort: vi.fn(async () => ({ ok: true })),
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  mockBridge(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatPanel', () => {
  it('renders the empty-state "Start a conversation" when ready with no messages', async () => {
    render(<ChatPanel chat={makeChat()} />);
    // cliDetected is async — wait for the happy-path copy.
    await waitFor(() => expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument());
  });

  it('renders the "Not connected" empty state when neither CLI nor key is configured', async () => {
    mockBridge(false);
    render(<ChatPanel chat={makeChat()} />);
    await waitFor(() => expect(screen.getByText(/Not connected/i)).toBeInTheDocument());
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

  it('shows the streaming indicator while isStreaming is true', () => {
    render(<ChatPanel chat={makeChat({ isStreaming: true })} />);
    expect(screen.getByText(/Claude is thinking/i)).toBeInTheDocument();
  });

  it('Enter in the textarea calls chat.send with the trimmed draft', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<ChatPanel chat={makeChat({ send })} />);
    // Wait for useClaude to report ready so the textarea accepts input.
    await waitFor(() => {
      const ta = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      expect(ta.disabled).toBe(false);
    });
    const textarea = screen.getByTestId('chat-input');
    fireEvent.change(textarea, { target: { value: '  hello  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('hello');
  });

  it('Shift+Enter inserts a newline instead of submitting', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<ChatPanel chat={makeChat({ send })} />);
    await waitFor(() => {
      const ta = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      expect(ta.disabled).toBe(false);
    });
    const textarea = screen.getByTestId('chat-input');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('swaps Send → Stop while streaming', () => {
    render(<ChatPanel chat={makeChat({ isStreaming: true })} />);
    expect(screen.getByTitle('Stop')).toBeInTheDocument();
    expect(screen.queryByTitle('Send')).not.toBeInTheDocument();
  });
});
