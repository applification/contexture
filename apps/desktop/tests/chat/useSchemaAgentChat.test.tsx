import { useSchemaAgentChat } from '@renderer/chat/useSchemaAgentChat';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextureSchemaAgentAPI } from '../../src/preload/index.d';

type Listener<T> = (payload: T) => void;

function makeApi(status: unknown = { provider: 'codex', readiness: 'authenticated_chatgpt' }) {
  const listeners = {
    assistantDelta: new Set<Listener<{ text: string }>>(),
    assistantFinal: new Set<Listener<{ text: string }>>(),
    toolCallStarted: new Set<Listener<{ id: string; name: string; input?: unknown }>>(),
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
    listModels: vi.fn(async () => []),
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
    onToolCallFinished: () => () => undefined,
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
    assistantDelta: (p: { text: string }) => {
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
    expect(calls.send).toHaveBeenCalledWith('hello');
    expect(result.current.isStreaming).toBe(true);
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

  it('surfaces non-ready Codex status', async () => {
    const { api } = makeApi({ provider: 'codex', readiness: 'cli_missing' });
    const { result } = renderHook(() => useSchemaAgentChat({ api }));

    await act(async () => undefined);

    expect(result.current.isReady).toBe(false);
    expect(result.current.unavailableMessage).toBe('Codex CLI not detected.');
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
});
