/**
 * `useClaudeSchemaChat` — hook behaviour over a fake preload API.
 *
 * Covers: send appends a user message, assistant chunks aggregate,
 * tool-use surfaces a status line, result flushes the buffer,
 * error appends an error message, and op-requests apply to the store
 * and reply.
 */

import { useClaudeSchemaChat } from '@renderer/chat/useClaudeSchemaChat';
import type { ChatMessage } from '@renderer/model/chat-history';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextureChatAPI } from '../../src/preload/index.d';

type Listener<T> = (payload: T) => void;

function makeApi() {
  const listeners = {
    assistant: new Set<Listener<{ text: string }>>(),
    toolUse: new Set<Listener<{ name: string; input: unknown }>>(),
    result: new Set<Listener<{ ok: boolean; error?: string }>>(),
    error: new Set<Listener<{ message: string }>>(),
    turnBegin: new Set<() => void>(),
    turnCommit: new Set<() => void>(),
    turnRollback: new Set<() => void>(),
    opRequest: new Set<Listener<{ id: string; op: unknown }>>(),
  };
  const send = vi.fn(async () => ({ ok: true }));
  const setIR = vi.fn();
  const replyOp = vi.fn();

  const api: ContextureChatAPI = {
    send,
    setIR,
    replyOp,
    onAssistant: (l) => {
      listeners.assistant.add(l);
      return () => listeners.assistant.delete(l);
    },
    onToolUse: (l) => {
      listeners.toolUse.add(l);
      return () => listeners.toolUse.delete(l);
    },
    onResult: (l) => {
      listeners.result.add(l);
      return () => listeners.result.delete(l);
    },
    onError: (l) => {
      listeners.error.add(l);
      return () => listeners.error.delete(l);
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
    onOpRequest: (l) => {
      listeners.opRequest.add(l);
      return () => listeners.opRequest.delete(l);
    },
  };

  const emit = {
    assistant: (p: { text: string }) => {
      listeners.assistant.forEach((l) => {
        l(p);
      });
    },
    toolUse: (p: { name: string; input: unknown }) => {
      listeners.toolUse.forEach((l) => {
        l(p);
      });
    },
    result: (p: { ok: boolean; error?: string }) => {
      listeners.result.forEach((l) => {
        l(p);
      });
    },
    error: (p: { message: string }) => {
      listeners.error.forEach((l) => {
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
    turnRollback: () => {
      listeners.turnRollback.forEach((l) => {
        l();
      });
    },
    opRequest: (p: { id: string; op: unknown }) => {
      listeners.opRequest.forEach((l) => {
        l(p);
      });
    },
  };

  return { api, emit, calls: { send, setIR, replyOp } };
}

describe('useClaudeSchemaChat', () => {
  beforeEach(() => {
    useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  });
  afterEach(cleanup);

  it('send appends a user message, pushes the IR, and marks streaming', async () => {
    const { api, calls } = makeApi();
    const { result } = renderHook(() => useClaudeSchemaChat({ api }));

    await act(async () => {
      await result.current.send('hello');
    });

    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([['user', 'hello']]);
    expect(calls.setIR).toHaveBeenCalledTimes(1);
    expect(calls.send).toHaveBeenCalledWith('hello');
    expect(result.current.isStreaming).toBe(true);
  });

  it('assistant chunks aggregate and flush on result', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useClaudeSchemaChat({ api }));

    await act(async () => {
      await result.current.send('hi');
    });
    act(() => {
      emit.assistant({ text: 'Hello ' });
      emit.assistant({ text: 'world' });
      emit.result({ ok: true });
    });

    const assistantMessages = result.current.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages.map((m) => m.content)).toEqual(['Hello world']);
    expect(result.current.isStreaming).toBe(false);
  });

  it('tool_use adds a status message', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useClaudeSchemaChat({ api }));

    await act(async () => {
      await result.current.send('add a Plot');
    });
    act(() => emit.toolUse({ name: 'add_type', input: {} }));

    const toolMessages = result.current.messages.filter(
      (m) => m.role === 'assistant' && m.content.includes('add_type'),
    );
    expect(toolMessages).toHaveLength(1);
  });

  it('error appends an assistant error message and clears streaming', async () => {
    const { api, emit } = makeApi();
    const { result } = renderHook(() => useClaudeSchemaChat({ api }));
    await act(async () => {
      await result.current.send('x');
    });
    act(() => emit.error({ message: 'boom' }));

    expect(
      result.current.messages.some((m) => m.role === 'assistant' && m.content === 'Error: boom'),
    ).toBe(true);
    expect(result.current.isStreaming).toBe(false);
  });

  it('op-request applies to the undoable store and replies', async () => {
    const { api, emit, calls } = makeApi();
    renderHook(() => useClaudeSchemaChat({ api }));

    act(() => {
      emit.opRequest({
        id: 'op-1',
        op: { kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } },
      });
    });

    expect(useUndoStore.getState().schema.types.map((t) => t.name)).toEqual(['Plot']);
    expect(calls.replyOp).toHaveBeenCalledWith(
      'op-1',
      expect.objectContaining({ schema: expect.any(Object) }),
    );
  });

  it('turn:begin + many ops + turn:commit collapses to one undo entry', async () => {
    const { api, emit } = makeApi();
    renderHook(() => useClaudeSchemaChat({ api }));

    act(() => {
      emit.turnBegin();
      emit.opRequest({
        id: '1',
        op: { kind: 'add_type', type: { kind: 'object', name: 'A', fields: [] } },
      });
      emit.opRequest({
        id: '2',
        op: { kind: 'add_type', type: { kind: 'object', name: 'B', fields: [] } },
      });
      emit.turnCommit();
    });

    expect(useUndoStore.getState().schema.types.map((t) => t.name)).toEqual(['A', 'B']);
    act(() => useUndoStore.getState().undo());
    // Both ops reverse as one step.
    expect(useUndoStore.getState().schema.types).toEqual([]);
  });

  it('hydrate replaces the transcript', () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useClaudeSchemaChat({ api }));

    const seed: ChatMessage[] = [
      { id: '1', role: 'user', content: 'old', createdAt: 1 },
      { id: '2', role: 'assistant', content: 'answer', createdAt: 2 },
    ];
    act(() => result.current.hydrate(seed));
    expect(result.current.messages).toEqual(seed);
  });
});
