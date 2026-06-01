/**
 * ChatPanel — minimal rendering + submit behaviour over the injected
 * schema-agent chat state.
 */

import { useChatThreadStore } from '@renderer/chat/useChatThreads';
import type { SchemaAgentChatState } from '@renderer/chat/useSchemaAgentChat';
import { ChatPanel } from '@renderer/components/chat/ChatPanel';
import { useAgentTurnsStore } from '@renderer/store/agent-turns';
import { useDocumentStore } from '@renderer/store/document';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeChat(overrides: Partial<SchemaAgentChatState> = {}): SchemaAgentChatState {
  return {
    provider: 'codex',
    providerLabel: 'Codex',
    setProvider: vi.fn(),
    restoreSettings: vi.fn(),
    models: [
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        supportsReasoningEffort: true,
        optionDescriptors: [
          {
            id: 'reasoningEffort',
            type: 'select',
            label: 'Reasoning',
            options: [
              { id: 'low', label: 'Low' },
              { id: 'medium', label: 'Medium' },
              { id: 'high', label: 'High', isDefault: true },
              { id: 'xhigh', label: 'Extra High' },
            ],
          },
        ],
      },
    ],
    modelsLoading: false,
    modelsUnavailable: false,
    model: 'gpt-5.4',
    setModel: vi.fn(),
    modelOptions: { reasoningEffort: 'high' },
    setModelOption: vi.fn(),
    effort: 'high',
    setEffort: vi.fn(),
    messages: [],
    isStreaming: false,
    liveAssistant: '',
    authRequired: false,
    isReady: true,
    unavailableMessage: null,
    providerThreadRef: undefined,
    desynced: false,
    clearAuthRequired: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    hydrate: vi.fn(),
    hydrateHistory: vi.fn(),
    toHistory: vi.fn(() => ({ version: '1', messages: [] })),
    clear: vi.fn(),
    ...overrides,
  };
}

function mockBridge(): void {
  (window as unknown as { contexture: unknown }).contexture = {
    schemaAgent: {
      threadSet: vi.fn(async () => ({ ok: true })),
      threadClear: vi.fn(async () => ({ ok: true })),
    },
    file: {
      pickChatContextFiles: vi.fn(async () => []),
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  useAgentTurnsStore.getState().reset();
  useUndoStore.setState({
    schema: { version: '1', types: [] },
    past: [],
    future: [],
    txDepth: 0,
    txStart: null,
    canUndo: false,
    canRedo: false,
  });
  useChatThreadStore.getState().reloadFromStorage();
  useDocumentStore.setState({
    filePath: null,
    isDirty: false,
    mode: 'bundle',
    importWarnings: [],
    unknownFormatPath: null,
    saveWithErrorsPrompt: null,
  });
  useDocumentStore.getState().resetLayout();
  mockBridge();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatPanel', () => {
  it('renders the empty-state "Start a conversation" when ready with no messages', async () => {
    render(<ChatPanel chat={makeChat()} />);
    await waitFor(() => expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument());
  });

  it('renders the "Not connected" empty state when provider auth is not ready', async () => {
    render(<ChatPanel chat={makeChat({ isReady: false })} />);
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
    expect(screen.getByText(/Codex is thinking/i)).toBeInTheDocument();
  });

  it('renders the latest agent turn summary for manual oversight', async () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    useAgentTurnsStore.getState().begin({
      before: { version: '1', types: [] },
      userMessage: 'add a Plot type',
      provider: 'codex',
      model: 'gpt-5.4',
    });
    useAgentTurnsStore.getState().recordToolResult({
      id: '1',
      op: { kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } },
      result: { schema: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] } },
    });
    useAgentTurnsStore.getState().recordToolResult({
      id: '2',
      op: { kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } },
      result: { error: 'add_type: type "Plot" already exists' },
    });
    useAgentTurnsStore.getState().finish({
      status: 'committed',
      after: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] },
    });

    render(<ChatPanel chat={makeChat()} />);

    expect(screen.getByTestId('agent-turn-summary')).toHaveTextContent(
      'Agent proposed 2 model changes: 1 applied, 1 rejected',
    );
    expect(screen.getByTestId('agent-turn-summary')).toHaveTextContent('2 tool calls');
    expect(screen.getByTestId('agent-turn-tool-summary')).toHaveTextContent('add_type x2');
    expect(screen.getByTestId('agent-turn-summary')).toHaveTextContent('1 applied');
    expect(screen.getByTestId('agent-turn-summary')).toHaveTextContent('1 rejected');
    fireEvent.click(screen.getByTestId('agent-turn-summary'));
    await waitFor(() => expect(screen.getAllByText('Added Plot')).toHaveLength(2));
    expect(screen.getByText('Schema diff')).toBeInTheDocument();
    expect(screen.getByText('add_type: type "Plot" already exists')).toBeInTheDocument();
    expect(screen.getByText('Raw turn record')).toBeInTheDocument();
    expect(screen.getByText('Undo turn')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Undo turn'));
    expect(useUndoStore.getState().schema.types).toEqual([]);
    await waitFor(() =>
      expect(screen.getByTestId('agent-turn-summary')).toHaveTextContent(
        'Agent turn undone: 1 model change rolled back',
      ),
    );
    expect(screen.queryByText('Undo turn')).not.toBeInTheDocument();
  });

  it('hides legacy inline tool-call messages from the transcript', () => {
    render(
      <ChatPanel
        chat={makeChat({
          messages: [
            { id: 'u', role: 'user', content: 'add a Plot type', createdAt: 1 },
            { id: 'tool', role: 'assistant', content: '`replace_schema`', createdAt: 2 },
            { id: 'a', role: 'assistant', content: 'Done.', createdAt: 3 },
          ],
        })}
      />,
    );

    expect(screen.queryByTestId('chat-message-tool')).not.toBeInTheDocument();
    expect(screen.queryByText('replace_schema')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-message-assistant')).toHaveTextContent('Done.');
  });

  it('highlights an applied agent turn while the final response is pending', () => {
    useAgentTurnsStore.getState().begin({
      before: { version: '1', types: [] },
      userMessage: 'add a Plot type',
      provider: 'codex',
      model: 'gpt-5.4',
    });
    useAgentTurnsStore.getState().recordToolResult({
      id: '1',
      op: { kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } },
      result: { schema: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] } },
    });

    render(<ChatPanel chat={makeChat({ isStreaming: true })} />);

    expect(screen.getByTestId('agent-turn-pending-highlight')).toBeInTheDocument();
  });

  it('highlights the agent turn from Enter submit until send completes', async () => {
    let resolveSend: () => void = () => undefined;
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    useAgentTurnsStore.getState().begin({
      before: { version: '1', types: [] },
      userMessage: 'add a Plot type',
      provider: 'codex',
      model: 'gpt-5.4',
    });

    render(<ChatPanel chat={makeChat({ send })} />);

    const textarea = screen.getByTestId('chat-input');
    fireEvent.change(textarea, { target: { value: 'add a Plot type' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByTestId('agent-turn-pending-highlight')).toBeInTheDocument(),
    );

    resolveSend();

    await waitFor(() =>
      expect(screen.queryByTestId('agent-turn-pending-highlight')).not.toBeInTheDocument(),
    );
  });

  it('opens a plus menu with separate photo and file context actions', async () => {
    render(<ChatPanel chat={makeChat()} />);

    fireEvent.pointerDown(screen.getByTestId('chat-add-context'));

    expect(await screen.findByTestId('chat-add-photos')).toHaveTextContent('Add photos');
    expect(screen.getByTestId('chat-add-files')).toHaveTextContent('Add files');
  });

  it('attaches selected files from the file context action to the next chat turn', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const pickChatContextFiles = vi.fn(async () => [
      {
        id: 'api',
        path: '/repo/src/api.ts',
        name: 'api.ts',
        size: 22,
        content: 'export const api = {};',
      },
    ]);
    (
      window as unknown as { contexture: { file: { pickChatContextFiles: unknown } } }
    ).contexture.file.pickChatContextFiles = pickChatContextFiles;

    render(<ChatPanel chat={makeChat({ send })} />);

    fireEvent.pointerDown(screen.getByTestId('chat-add-context'));
    fireEvent.click(await screen.findByTestId('chat-add-files'));
    await waitFor(() =>
      expect(screen.getByTestId('chat-attachment-chip')).toHaveTextContent('api.ts'),
    );

    const textarea = screen.getByTestId('chat-input');
    fireEvent.change(textarea, { target: { value: 'model this API' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('model this API', [
        expect.objectContaining({ path: '/repo/src/api.ts', content: 'export const api = {};' }),
      ]),
    );
    expect(pickChatContextFiles).toHaveBeenCalledWith('files');
    expect(screen.queryByTestId('chat-attachment-chip')).not.toBeInTheDocument();
  });

  it('shows submitted file context on the user message', () => {
    render(
      <ChatPanel
        chat={makeChat({
          messages: [
            {
              id: 'u1',
              role: 'user',
              content: 'model this API',
              createdAt: 1,
              contextAttachments: [
                {
                  id: 'api',
                  path: '/repo/src/api.ts',
                  name: 'api.ts',
                  size: 22,
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('chat-message-context-attachments')).toHaveTextContent('api.ts');
  });

  it('attaches selected files from the photo context action to the next chat turn', async () => {
    const pickChatContextFiles = vi.fn(async () => [
      {
        id: 'photo-note',
        path: '/repo/photo-notes.md',
        name: 'photo-notes.md',
        size: 28,
        content: 'Screenshot notes for the model.',
      },
    ]);
    (
      window as unknown as { contexture: { file: { pickChatContextFiles: unknown } } }
    ).contexture.file.pickChatContextFiles = pickChatContextFiles;

    render(<ChatPanel chat={makeChat()} />);

    fireEvent.pointerDown(screen.getByTestId('chat-add-context'));
    fireEvent.click(await screen.findByTestId('chat-add-photos'));

    await waitFor(() =>
      expect(screen.getByTestId('chat-attachment-chip')).toHaveTextContent('photo-notes.md'),
    );
    expect(pickChatContextFiles).toHaveBeenCalledWith('photos');
  });

  it('does not offer agent turn undo after an intervening schema edit', async () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    useAgentTurnsStore.getState().begin({
      before: { version: '1', types: [] },
      userMessage: 'add a Plot type',
      provider: 'codex',
      model: 'gpt-5.4',
    });
    useAgentTurnsStore.getState().recordToolResult({
      id: '1',
      op: { kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } },
      result: { schema: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] } },
    });
    useAgentTurnsStore.getState().finish({
      status: 'committed',
      after: { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] },
    });
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'ManualEdit', fields: [] },
    });

    render(<ChatPanel chat={makeChat()} />);

    fireEvent.click(screen.getByTestId('agent-turn-summary'));
    await waitFor(() => expect(screen.getByText('Schema diff')).toBeInTheDocument());
    expect(screen.queryByText('Undo turn')).not.toBeInTheDocument();
  });

  it('Enter in the textarea calls chat.send with the trimmed draft', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<ChatPanel chat={makeChat({ send })} />);
    await waitFor(() => {
      const ta = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      expect(ta.disabled).toBe(false);
    });
    const textarea = screen.getByTestId('chat-input');
    fireEvent.change(textarea, { target: { value: '  hello  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('hello', []);
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

  it('keeps the effort control visible for schema-agent chats', () => {
    render(<ChatPanel chat={makeChat()} />);
    expect(screen.getByTestId('chat-effort-select')).toHaveTextContent(/High/i);
    expect(screen.getByTestId('chat-effort-select')).toHaveAttribute('title', 'Reasoning');
  });

  it('falls back to a provider default when schema-agent effort is empty', () => {
    render(<ChatPanel chat={makeChat({ effort: '' })} />);
    expect(screen.getByTestId('chat-effort-select')).toHaveTextContent(/High/i);
  });

  it('renders model-provided effort options instead of hard-coded provider values', () => {
    render(
      <ChatPanel
        chat={makeChat({
          effort: 'xhigh',
          modelOptions: { reasoningEffort: 'xhigh' },
        })}
      />,
    );
    expect(screen.getByTestId('chat-effort-select')).toHaveTextContent(/Extra High/i);
  });

  it('hydrates the active schema-agent thread through the chat lifecycle action', () => {
    const hydrateHistory = vi.fn();
    useDocumentStore.setState({ filePath: '/tmp/record-shop.contexture.json' });
    localStorage.setItem('contexture-active-thread', 'thread-1');
    localStorage.setItem(
      'contexture-chat-threads',
      JSON.stringify([
        {
          id: 'thread-1',
          provider: 'claude',
          title: 'Record shop',
          messages: [{ id: 'u', role: 'user', content: 'hello', createdAt: 1 }],
          model: 'opus',
          effort: 'xhigh',
          modelOptions: { reasoningEffort: 'xhigh', fastMode: true },
          filePath: '/tmp/record-shop.contexture.json',
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );
    useChatThreadStore.getState().reloadFromStorage();

    render(<ChatPanel chat={makeChat({ hydrateHistory })} />);

    expect(hydrateHistory).toHaveBeenCalledWith({
      version: '1',
      messages: [{ id: 'u', role: 'user', content: 'hello', createdAt: 1 }],
      provider: 'claude',
      model: 'opus',
      effort: 'xhigh',
      modelOptions: { reasoningEffort: 'xhigh', fastMode: true },
    });
  });

  it('starts with an empty chat when no Contexture file is selected', async () => {
    const hydrate = vi.fn();
    const hydrateHistory = vi.fn();
    const restoreSettings = vi.fn();
    localStorage.setItem('contexture-active-thread', 'thread-1');
    localStorage.setItem(
      'contexture-chat-threads',
      JSON.stringify([
        {
          id: 'thread-1',
          provider: 'codex',
          title: 'Existing project chat',
          messages: [{ id: 'u', role: 'user', content: 'old chat', createdAt: 1 }],
          model: 'gpt-5.4',
          effort: 'high',
          filePath: '/tmp/project.contexture.json',
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );
    useChatThreadStore.getState().reloadFromStorage();

    render(<ChatPanel chat={makeChat({ hydrate, hydrateHistory, restoreSettings })} />);

    await waitFor(() => expect(localStorage.getItem('contexture-active-thread')).toBeNull());
    expect(hydrate).not.toHaveBeenCalled();
    expect(restoreSettings).not.toHaveBeenCalled();
    expect(hydrateHistory).toHaveBeenCalledWith({ version: '1', messages: [] });
  });

  it('does not persist untitled chat messages as a saved thread', async () => {
    render(
      <ChatPanel
        chat={makeChat({
          messages: [{ id: 'u', role: 'user', content: 'draft a schema', createdAt: 1 }],
        })}
      />,
    );

    await waitFor(() => expect(localStorage.getItem('contexture-active-thread')).toBeNull());
    expect(JSON.parse(localStorage.getItem('contexture-chat-threads') ?? '[]')).toEqual([]);
  });

  it('auto-grows the textarea via CSS field-sizing with an 8-line cap and scroll overflow', async () => {
    render(<ChatPanel chat={makeChat()} />);
    await waitFor(() => {
      const ta = screen.getByTestId('chat-input') as HTMLTextAreaElement;
      expect(ta.disabled).toBe(false);
    });
    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;

    // Auto-grow is delivered by CSS (`field-sizing: content`) rather
    // than a useEffect that pokes inline height — verify the contract
    // is expressed on the element.
    expect(textarea.className).toMatch(/field-sizing-content/);
    expect(textarea.className).toMatch(/max-h-\[/);
    expect(textarea.className).toMatch(/overflow-y-auto/);
  });
});
