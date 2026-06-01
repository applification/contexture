import { useSchemaAgentModelsStore } from '@renderer/chat/schemaAgentModelsStore';
import { useSchemaAgentSessionStore } from '@renderer/chat/schemaAgentSessionStore';
import { useSchemaAgentChat } from '@renderer/chat/useSchemaAgentChat';
import { useAgentTurnsStore } from '@renderer/store/agent-turns';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextureSchemaAgentAPI } from '../../src/preload/index.d';

type Listener<T> = (payload: T) => void;

function makeApi(status: unknown = { provider: 'codex', readiness: 'authenticated_chatgpt' }) {
  const listeners = {
    assistantDelta: new Set<Listener<{ text: string; boundary?: 'new_message' }>>(),
    assistantFinal: new Set<Listener<{ text: string }>>(),
    toolCallStarted: new Set<Listener<{ id: string; name: string; input?: unknown }>>(),
    toolCallFinished: new Set<
      Listener<{ id: string; name: string; ok: boolean; result?: unknown }>
    >(),
    error: new Set<Listener<{ message: string }>>(),
    statusChanged: new Set<Listener<unknown>>(),
    turnBegin: new Set<() => void>(),
    turnCommit: new Set<() => void>(),
    turnRollback: new Set<() => void>(),
    toolRequest: new Set<Listener<{ id: string; op: unknown }>>(),
    threadUpdated: new Set<Listener<{ thread: unknown }>>(),
    threadDesynced: new Set<Listener<{ thread: unknown; reason: string }>>(),
  };
  const send = vi.fn(async () => ({ ok: true }));
  const setIR = vi.fn();
  const replyTool = vi.fn();

  const api: ContextureSchemaAgentAPI = {
    send,
    setIR,
    abort: vi.fn(async () => ({ ok: true })),
    getStatus: vi.fn(async () => status),
    listModels: vi.fn(async () => [
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        optionDescriptors: [
          {
            id: 'reasoningEffort',
            type: 'select',
            label: 'Reasoning',
            options: [
              { id: 'low', label: 'Low' },
              { id: 'medium', label: 'Medium' },
              { id: 'high', label: 'High', isDefault: true },
            ],
          },
        ],
      },
    ]),
    setProvider: vi.fn(async () => ({ ok: true })),
    setModelOptions: vi.fn(async () => ({ ok: true })),
    startLogin: vi.fn(async () => ({ id: 'login-1', mode: 'chatgpt' })),
    cancelLogin: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    threadSet: vi.fn(async () => ({ ok: true })),
    threadClear: vi.fn(async () => ({ ok: true })),
    replyTool,
    onAssistantDelta: (l) => {
      listeners.assistantDelta.add(l);
      return () => listeners.assistantDelta.delete(l);
    },
    onAssistantFinal: (l) => {
      listeners.assistantFinal.add(l);
      return () => listeners.assistantFinal.delete(l);
    },
    onToolCallStarted: (l) => {
      listeners.toolCallStarted.add(l);
      return () => listeners.toolCallStarted.delete(l);
    },
    onToolCallFinished: (l) => {
      listeners.toolCallFinished.add(l);
      return () => listeners.toolCallFinished.delete(l);
    },
    onError: (l) => {
      listeners.error.add(l);
      return () => listeners.error.delete(l);
    },
    onStatusChanged: (l) => {
      listeners.statusChanged.add(l);
      return () => listeners.statusChanged.delete(l);
    },
    onThreadUpdated: (l) => {
      listeners.threadUpdated.add(l);
      return () => listeners.threadUpdated.delete(l);
    },
    onThreadDesynced: (l) => {
      listeners.threadDesynced.add(l);
      return () => listeners.threadDesynced.delete(l);
    },
    onToolRequest: (l) => {
      listeners.toolRequest.add(l);
      return () => listeners.toolRequest.delete(l);
    },
    onTurnBegin: (l) => {
      listeners.turnBegin.add(l);
      return () => listeners.turnBegin.delete(l);
    },
    onTurnCommit: (l) => {
      listeners.turnCommit.add(l);
      return () => listeners.turnCommit.delete(l);
    },
    onTurnRollback: (l) => {
      listeners.turnRollback.add(l);
      return () => listeners.turnRollback.delete(l);
    },
  };

  const emit = {
    assistantDelta: (p: { text: string; boundary?: 'new_message' }) => {
      listeners.assistantDelta.forEach((l) => {
        l(p);
      });
    },
    assistantFinal: (p: { text: string }) => {
      listeners.assistantFinal.forEach((l) => {
        l(p);
      });
    },
    toolCallStarted: (p: { id: string; name: string; input?: unknown }) => {
      listeners.toolCallStarted.forEach((l) => {
        l(p);
      });
    },
    toolCallFinished: (p: { id: string; name: string; ok: boolean; result?: unknown }) => {
      listeners.toolCallFinished.forEach((l) => {
        l(p);
      });
    },
    error: (p: { message: string }) => {
      listeners.error.forEach((l) => {
        l(p);
      });
    },
    statusChanged: (p: unknown) => {
      listeners.statusChanged.forEach((l) => {
        l(p);
      });
    },
    turnBegin: () => {
      listeners.turnBegin.forEach((l) => {
        l();
      });
    },
    turnCommit: () => {
      listeners.turnCommit.forEach((l) => {
        l();
      });
    },
    toolRequest: (p: { id: string; op: unknown }) => {
      listeners.toolRequest.forEach((l) => {
        l(p);
      });
    },
    threadUpdated: (p: { thread: unknown }) => {
      listeners.threadUpdated.forEach((l) => {
        l(p);
      });
    },
    threadDesynced: (p: { thread: unknown; reason: string }) => {
      listeners.threadDesynced.forEach((l) => {
        l(p);
      });
    },
  };

  return { api, emit, calls: { send, setIR, replyTool } };
}

describe('useSchemaAgentChat', () => {
  beforeEach(() => {
    localStorage.clear();
    useSchemaAgentModelsStore.getState().reset();
    useSchemaAgentSessionStore.getState().reset();
    useAgentTurnsStore.getState().reset();
    useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  });
  afterEach(cleanup);

  it('reads provider readiness and sends the current IR', async () => {
    const { api, calls } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);
    expect(result.current.isReady).toBe(true);

    await act(async () => {
      await result.current.send('hello');
    });

    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([['user', 'hello']]);
    expect(calls.setIR).toHaveBeenCalledTimes(1);
    expect(calls.send).toHaveBeenCalledWith('hello', []);
    expect(result.current.isStreaming).toBe(true);
  });

  it('forwards explicit file attachments with the user message', async () => {
    const { api, calls } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);
    await act(async () => {
      await result.current.send('model this API', [
        {
          id: 'api',
          path: '/repo/src/api.ts',
          name: 'api.ts',
          size: 22,
          content: 'export const api = {};',
        },
      ]);
    });

    expect(calls.send).toHaveBeenCalledWith('model this API', [
      expect.objectContaining({ path: '/repo/src/api.ts', content: 'export const api = {};' }),
    ]);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'model this API',
      contextAttachments: [
        {
          id: 'api',
          path: '/repo/src/api.ts',
          name: 'api.ts',
          size: 22,
        },
      ],
    });
    expect(result.current.messages[0]?.contextAttachments?.[0]).not.toHaveProperty('content');
  });

  it('aggregates deltas and flushes on assistant_final', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);
    await act(async () => {
      await result.current.send('hi');
    });
    act(() => {
      emit.assistantDelta({ text: 'Hello ' });
      emit.assistantDelta({ text: 'world' });
      emit.assistantFinal({ text: 'Hello world' });
    });

    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 'Hello world'],
    ]);
    expect(result.current.isStreaming).toBe(false);
  });

  it('preserves assistant message boundaries while streaming', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);
    await act(async () => {
      await result.current.send('hi');
    });
    act(() => {
      emit.assistantDelta({ text: 'First update.' });
      emit.assistantDelta({ text: 'Second update.', boundary: 'new_message' });
      emit.assistantFinal({ text: 'First update.\n\nSecond update.' });
    });

    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 'First update.\n\nSecond update.'],
    ]);
  });

  it('surfaces schema-agent send failures that happen before streaming starts', async () => {
    const { api } = makeApi();
    vi.mocked(api.send).mockResolvedValueOnce({ ok: false, error: 'Codex app-server unavailable' });
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);
    await act(async () => {
      await result.current.send('hi');
    });

    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 'Error: Codex app-server unavailable'],
    ]);
    expect(result.current.isStreaming).toBe(false);
  });

  it('applies renderer op requests and replies through schema-agent', () => {
    const { api, emit, calls } = makeApi();
    renderHook(() => useSchemaAgentChat({ api }));

    act(() => {
      emit.toolRequest({
        id: 'op-1',
        op: { kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } },
      });
    });

    expect(useUndoStore.getState().schema.types.map((t) => t.name)).toEqual(['Plot']);
    expect(calls.replyTool).toHaveBeenCalledWith(
      'op-1',
      expect.objectContaining({ schema: expect.any(Object) }),
    );
  });

  it('turn lifecycle still collapses many ops to one undo entry', () => {
    const { api, emit } = makeApi();
    renderHook(() => useSchemaAgentChat({ api }));

    act(() => {
      emit.turnBegin();
      emit.toolRequest({
        id: '1',
        op: { kind: 'add_type', type: { kind: 'object', name: 'A', fields: [] } },
      });
      emit.toolRequest({
        id: '2',
        op: { kind: 'add_type', type: { kind: 'object', name: 'B', fields: [] } },
      });
      emit.turnCommit();
    });

    expect(useUndoStore.getState().schema.types.map((t) => t.name)).toEqual(['A', 'B']);
    act(() => useUndoStore.getState().undo());
    expect(useUndoStore.getState().schema.types).toEqual([]);
  });

  it('records applied and rejected schema-agent ops as one reviewable turn', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.model).toBe('gpt-5.4');
    });
    await act(async () => {
      await result.current.send('add a plot');
    });
    act(() => {
      emit.turnBegin();
      emit.toolCallStarted({ id: 'pending-1', name: 'add_type', input: { name: 'Plot' } });
      emit.toolRequest({
        id: '1',
        op: { kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } },
      });
      emit.toolCallStarted({ id: 'pending-2', name: 'add_type', input: { name: 'Plot' } });
      emit.toolRequest({
        id: '2',
        op: { kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } },
      });
      emit.assistantFinal({ text: 'Added Plot.' });
      emit.turnCommit();
    });

    expect(useAgentTurnsStore.getState().turns).toEqual([
      expect.objectContaining({
        status: 'committed',
        userMessage: 'add a plot',
        assistantText: 'Added Plot.',
        provider: 'codex',
        model: 'gpt-5.4',
        summary: 'Agent proposed 2 model changes: 1 applied, 1 rejected',
        ops: [
          expect.objectContaining({ id: '1', name: 'add_type', status: 'applied' }),
          expect.objectContaining({ id: '2', name: 'add_type', status: 'rejected' }),
        ],
      }),
    ]);
  });

  it('keeps tool-call status out of the chat transcript', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.model).toBe('gpt-5.4');
    });
    await act(async () => {
      await result.current.send('add a plot');
    });
    act(() => {
      emit.turnBegin();
      emit.toolCallStarted({ id: 'pending-1', name: 'add_type', input: { name: 'Plot' } });
    });

    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'add a plot'],
    ]);
    expect(useAgentTurnsStore.getState().turns[0]?.ops).toEqual([
      expect.objectContaining({ id: 'pending-1', name: 'add_type', status: 'pending' }),
    ]);
  });

  it('records completed non-op tools in the agent turn ledger', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.model).toBe('gpt-5.4');
    });
    await act(async () => {
      await result.current.send('emit and check drift');
    });
    act(() => {
      emit.turnBegin();
      emit.toolCallStarted({ id: 'emit-1', name: 'emit_contexture', input: {} });
      emit.toolCallFinished({
        id: 'emit-1',
        name: 'emit_contexture',
        ok: true,
        result: { emitted: ['convex/schema.ts'] },
      });
      emit.toolCallStarted({ id: 'drift-1', name: 'check_contexture_drift', input: {} });
      emit.toolCallFinished({
        id: 'drift-1',
        name: 'check_contexture_drift',
        ok: true,
        result: { clean: true },
      });
      emit.turnCommit();
    });

    expect(useAgentTurnsStore.getState().turns[0]).toEqual(
      expect.objectContaining({
        summary: 'Agent emitted generated files and checked drift: clean',
        ops: [
          expect.objectContaining({ id: 'emit-1', name: 'emit_contexture', status: 'non_op' }),
          expect.objectContaining({
            id: 'drift-1',
            name: 'check_contexture_drift',
            status: 'non_op',
          }),
        ],
      }),
    );
  });

  it('marks provider threads stale after undo and redo', async () => {
    const { api, emit } = makeApi();
    renderHook(() => useSchemaAgentChat({ api }));

    act(() => {
      emit.threadUpdated({ thread: { provider: 'codex', threadId: 'thread-1' } });
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'Plot', fields: [] },
      });
      useUndoStore.getState().undo();
    });

    expect(useSchemaAgentSessionStore.getState().desynced).toBe(true);
  });

  it('surfaces non-ready Codex status', async () => {
    const { api } = makeApi({ provider: 'codex', readiness: 'cli_missing' });
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);

    expect(result.current.isReady).toBe(false);
    expect(result.current.unavailableMessage).toBe('Codex CLI not detected.');
  });

  it('normalizes stored effort values for the selected provider', async () => {
    localStorage.setItem('contexture-schema-agent-codex-effort', 'med');
    const { api } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);

    expect(result.current.effort).toBe('medium');

    act(() => {
      result.current.setEffort('auto');
    });

    expect(result.current.effort).toBe('high');
    expect(localStorage.getItem('contexture-schema-agent-codex-effort')).toBe('high');
  });

  it('switches schema-agent providers through the shared API', async () => {
    const { api } = makeApi({ provider: 'claude', readiness: 'authenticated_cli' });
    vi.mocked(api.listModels).mockResolvedValue([
      { id: 'claude-sonnet-4-6', label: 'Sonnet', supportsReasoningEffort: true },
    ]);
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);
    await act(async () => {
      result.current.setProvider('claude');
    });
    await act(async () => undefined);

    expect(result.current.provider).toBe('claude');
    expect(result.current.providerLabel).toBe('Claude');
    expect(result.current.isReady).toBe(true);
    expect(api.setProvider).toHaveBeenCalledWith('claude');
  });

  it('selects the provider before loading that provider model list', async () => {
    const { api } = makeApi();
    const calls: string[] = [];
    let providerReady = false;
    vi.mocked(api.setProvider).mockImplementation(async (provider) => {
      calls.push(`set:${provider}`);
      await Promise.resolve();
      providerReady = true;
      return { ok: true };
    });
    vi.mocked(api.listModels).mockImplementation(async () => {
      calls.push('list');
      if (!providerReady) return [];
      return [{ id: 'gpt-5.4', label: 'GPT-5.4', supportsReasoningEffort: true }];
    });

    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.models).toEqual([
        { id: 'gpt-5.4', label: 'GPT-5.4', supportsReasoningEffort: true },
      ]);
    });
    expect(api.listModels).toHaveBeenCalledWith('codex');
    expect(calls).toContain('list');
  });

  it('loads models for the selected provider instead of the globally active runtime', async () => {
    const { api } = makeApi({ provider: 'claude', readiness: 'authenticated_cli' });
    vi.mocked(api.listModels).mockImplementation(async (provider) => {
      if (provider !== 'claude') return [];
      return [{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' }];
    });

    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => {
      result.current.setProvider('claude');
    });

    await waitFor(() => {
      expect(result.current.models).toEqual([
        { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      ]);
    });
    expect(api.listModels).toHaveBeenCalledWith('claude');
  });

  it('does not expose stale Codex models while persisted Claude models load', async () => {
    localStorage.setItem('contexture-schema-agent-provider', 'claude');
    localStorage.setItem('contexture-schema-agent-claude-model', 'gpt-5.4');
    const { api } = makeApi({ provider: 'claude', readiness: 'authenticated_cli' });
    vi.mocked(api.listModels).mockImplementation(async (provider) =>
      provider === 'claude'
        ? [{ id: 'claude-opus-4-7', label: 'Opus 4.7' }]
        : [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
    );

    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    expect(result.current.provider).toBe('claude');
    expect(result.current.models).toEqual([]);
    await waitFor(() => {
      expect(result.current.models).toEqual([{ id: 'claude-opus-4-7', label: 'Opus 4.7' }]);
    });
    expect(result.current.model).toBe('claude-opus-4-7');
  });

  it('defaults to the selected provider model when no model is stored on boot', async () => {
    localStorage.setItem('contexture-schema-agent-provider', 'claude');
    const { api } = makeApi({ provider: 'claude', readiness: 'authenticated_cli' });
    vi.mocked(api.listModels).mockResolvedValue([
      { id: 'claude-sonnet-4-6', label: 'Sonnet' },
      { id: 'claude-opus-4-7', label: 'Opus 4.7' },
    ]);

    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    expect(result.current.model).toBe('');
    expect(result.current.modelsLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.model).toBe('claude-sonnet-4-6');
    });
    expect(result.current.modelsUnavailable).toBe(false);
    expect(localStorage.getItem('contexture-schema-agent-claude-model')).toBe('claude-sonnet-4-6');
    expect(api.setModelOptions).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });

  it('restores provider, model, effort, and options atomically', async () => {
    const { api } = makeApi();
    vi.mocked(api.listModels).mockImplementation(async (provider) =>
      provider === 'claude'
        ? [{ id: 'opus', label: 'Opus' }]
        : [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
    );
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.provider).toBe('codex');
    });

    act(() => {
      result.current.restoreSettings({
        provider: 'claude',
        model: 'opus',
        effort: 'xhigh',
        modelOptions: { reasoningEffort: 'xhigh', fastMode: true },
      });
    });

    expect(result.current.provider).toBe('claude');
    expect(result.current.model).toBe('opus');
    expect(result.current.effort).toBe('xhigh');
    expect(result.current.modelOptions).toEqual({ reasoningEffort: 'xhigh', fastMode: true });
    expect(localStorage.getItem('contexture-schema-agent-claude-model')).toBe('opus');
    expect(localStorage.getItem('contexture-schema-agent-claude-effort')).toBe('xhigh');
    expect(api.setProvider).toHaveBeenCalledWith('claude');
  });

  it('keeps loaded models when restoring the already-selected provider', async () => {
    const { api } = makeApi();
    vi.mocked(api.listModels).mockResolvedValue([
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.5', label: 'GPT-5.5' },
    ]);
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.modelsLoading).toBe(false);
    });
    expect(result.current.models.map((model) => model.id)).toEqual(['gpt-5.4', 'gpt-5.5']);

    act(() => {
      result.current.setProvider('codex');
    });

    expect(result.current.modelsLoading).toBe(false);
    expect(result.current.models.map((model) => model.id)).toEqual(['gpt-5.4', 'gpt-5.5']);
  });

  it('keeps the active model catalogue when hydrating an empty document chat', async () => {
    const { api } = makeApi();
    vi.mocked(api.listModels).mockResolvedValue([
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.5', label: 'GPT-5.5' },
    ]);
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.modelsLoading).toBe(false);
    });
    vi.mocked(api.listModels).mockClear();

    act(() => {
      result.current.hydrateHistory({ version: '1', messages: [] });
    });

    expect(result.current.provider).toBe('codex');
    expect(result.current.modelsLoading).toBe(false);
    expect(result.current.models.map((model) => model.id)).toEqual(['gpt-5.4', 'gpt-5.5']);
    expect(api.listModels).not.toHaveBeenCalled();
    expect(api.threadClear).toHaveBeenCalled();
  });

  it('keeps chat hydration actions stable across provider changes', async () => {
    const { api } = makeApi();
    vi.mocked(api.listModels).mockImplementation(async (provider) =>
      provider === 'claude'
        ? [{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' }]
        : [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
    );
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    const hydrateHistory = result.current.hydrateHistory;
    const restoreSettings = result.current.restoreSettings;

    act(() => {
      result.current.setProvider('claude');
    });
    await waitFor(() => {
      expect(result.current.provider).toBe('claude');
    });

    expect(result.current.hydrateHistory).toBe(hydrateHistory);
    expect(result.current.restoreSettings).toBe(restoreSettings);
  });

  it('surfaces an empty model state instead of pretending a model is selected', async () => {
    const { api } = makeApi();
    vi.mocked(api.listModels).mockResolvedValue([]);
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.modelsUnavailable).toBe(true);
    });
    expect(result.current.model).toBe('');

    await act(async () => {
      await result.current.send('hello');
    });

    expect(api.send).not.toHaveBeenCalled();
    expect(result.current.unavailableMessage).toBe(
      'No model is available for the selected provider.',
    );
  });

  it('persists and pushes generic model options', async () => {
    const { api } = makeApi();
    vi.mocked(api.listModels).mockResolvedValue([
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        optionDescriptors: [
          {
            id: 'reasoningEffort',
            type: 'select',
            label: 'Reasoning',
            options: [
              { id: 'low', label: 'Low' },
              { id: 'medium', label: 'Medium', isDefault: true },
              { id: 'high', label: 'High' },
              { id: 'xhigh', label: 'Extra High' },
            ],
          },
          { id: 'fastMode', type: 'boolean', label: 'Fast', defaultValue: false },
        ],
      },
    ]);

    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.modelOptions).toEqual({
        reasoningEffort: 'medium',
        fastMode: false,
      });
    });

    act(() => {
      result.current.setModelOption('fastMode', true);
    });

    await waitFor(() => {
      expect(api.setModelOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.5',
          options: { reasoningEffort: 'medium', fastMode: true },
        }),
      );
    });
  });

  it('pushes the displayed default model before the first send', async () => {
    const { api, calls } = makeApi();
    vi.mocked(api.listModels).mockResolvedValue([
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        optionDescriptors: [
          {
            id: 'reasoningEffort',
            type: 'select',
            label: 'Reasoning',
            options: [
              { id: 'low', label: 'Low' },
              { id: 'medium', label: 'Medium', isDefault: true },
              { id: 'high', label: 'High' },
              { id: 'xhigh', label: 'Extra High' },
            ],
          },
          { id: 'fastMode', type: 'boolean', label: 'Fast', defaultValue: false },
        ],
      },
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
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
    ]);
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await waitFor(() => {
      expect(result.current.model).toBe('gpt-5.5');
    });
    vi.mocked(api.setModelOptions).mockClear();

    await act(async () => {
      await result.current.send('hello');
    });

    expect(api.setModelOptions).toHaveBeenCalledWith({
      model: 'gpt-5.5',
      effort: 'medium',
      options: { reasoningEffort: 'medium', fastMode: false },
    });
    expect(vi.mocked(api.setModelOptions).mock.invocationCallOrder.at(-1)).toBeLessThan(
      calls.send.mock.invocationCallOrder[0],
    );
  });

  it('tracks provider thread refs and desync state from schema-agent events', () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));
    const thread = { provider: 'codex', threadId: 'thread-1' };

    act(() => {
      emit.threadUpdated({ thread });
    });

    expect(result.current.providerThreadRef).toEqual(thread);
    expect(result.current.desynced).toBe(false);

    act(() => {
      emit.threadDesynced({ thread, reason: 'rollback failed' });
    });

    expect(result.current.providerThreadRef).toEqual(thread);
    expect(result.current.desynced).toBe(true);
  });

  it('marks the provider thread stale when the model changes outside the agent', () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));
    const thread = { provider: 'codex', threadId: 'thread-1' };

    act(() => {
      emit.threadUpdated({ thread });
    });
    expect(result.current.desynced).toBe(false);

    act(() => {
      useUndoStore.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'ExternalEdit', fields: [] },
      });
    });

    expect(result.current.providerThreadRef).toEqual(thread);
    expect(result.current.desynced).toBe(true);
  });

  it('serializes the current chat sidecar from schema-agent state', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));
    const thread = { provider: 'codex', threadId: 'thread-1' };

    await waitFor(() => {
      expect(result.current.model).toBe('gpt-5.4');
    });
    await act(async () => {
      await result.current.send('hello');
    });
    act(() => {
      emit.threadUpdated({ thread });
    });

    expect(result.current.toHistory()).toMatchObject({
      version: '1',
      messages: [expect.objectContaining({ role: 'user', content: 'hello' })],
      provider: 'codex',
      model: 'gpt-5.4',
      effort: 'high',
      modelOptions: { reasoningEffort: 'high' },
      providerThreadRef: thread,
    });
  });

  it('hydrates chat sidecar state and provider thread through one lifecycle action', async () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useSchemaAgentChat({ api }));
    const thread = { provider: 'codex', threadId: 'thread-42' };

    act(() => {
      result.current.hydrateHistory({
        version: '1',
        provider: 'codex',
        model: 'gpt-5.4',
        effort: 'high',
        modelOptions: { reasoningEffort: 'high' },
        providerThreadRef: thread,
        messages: [{ id: 'm', role: 'user', content: 'loaded', createdAt: 1 }],
      });
    });

    expect(result.current.messages).toEqual([
      { id: 'm', role: 'user', content: 'loaded', createdAt: 1 },
    ]);
    expect(result.current.providerThreadRef).toEqual(thread);
    expect(api.threadSet).toHaveBeenCalledWith(thread);
  });
});
