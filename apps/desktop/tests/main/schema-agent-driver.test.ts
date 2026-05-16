import { ChatTurnController } from '@main/ipc/chat-turn';
import type {
  ProviderCapabilities,
  ProviderRuntime,
  ProviderRuntimeEvent,
  ProviderThreadRef,
} from '@main/providers/runtime';
import {
  SCHEMA_AGENT_ASSISTANT_DELTA,
  SCHEMA_AGENT_ERROR,
  SCHEMA_AGENT_THREAD_DESYNCED,
  SCHEMA_AGENT_THREAD_UPDATED,
  SCHEMA_AGENT_TOOL_CALL_FINISHED,
  SCHEMA_AGENT_TOOL_CALL_STARTED,
  SchemaAgentDriver,
  type SchemaAgentTransport,
} from '@main/providers/schema-agent-driver';
import type { Schema } from '@renderer/model/ir';
import { describe, expect, it, vi } from 'vitest';

const capabilities: ProviderCapabilities = {
  authModes: ['chatgpt', 'api-key'],
  modelSource: 'runtime',
  supportsThreadResume: true,
  supportsThreadRollback: true,
  supportsDynamicTools: true,
  supportsMcpTools: false,
  supportsInterrupt: true,
  supportsRateLimitStatus: true,
  supportsReasoningEffort: true,
  supportsSchemaOnlyMode: true,
};

const emptyIR: Schema = { version: '1', types: [] };
const thread: ProviderThreadRef = { provider: 'codex', threadId: 'thread-1' };

function fakeTransport(): {
  transport: SchemaAgentTransport;
  sent: Array<{ channel: string; payload: unknown }>;
} {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  return {
    transport: { send: (channel, payload) => sent.push({ channel, payload }) },
    sent,
  };
}

function makeRuntime(events: ProviderRuntimeEvent[]): ProviderRuntime {
  return {
    provider: 'codex',
    capabilities,
    getStatus: vi.fn(),
    listModels: vi.fn(),
    startThread: vi.fn(async () => thread),
    resumeThread: vi.fn(async ({ thread: nextThread }) => nextThread),
    sendTurn: vi.fn(async function* () {
      for (const event of events) yield event;
    }),
    generateText: vi.fn(async () => ''),
    interruptTurn: vi.fn(),
    rollbackThread: vi.fn(),
    startLogin: vi.fn(),
    cancelLogin: vi.fn(),
    logout: vi.fn(),
  };
}

function makeDriver(runtime: ProviderRuntime, transport: SchemaAgentTransport) {
  let currentThread: ProviderThreadRef | undefined;
  const desynced: Array<{ thread: ProviderThreadRef; reason: string }> = [];
  const turnSent: Array<{ channel: string; payload?: unknown }> = [];
  const turnController = new ChatTurnController({
    send: (channel, payload) => turnSent.push({ channel, payload }),
  });

  const driver = new SchemaAgentDriver({
    runtime,
    transport,
    turnController,
    getCurrentIR: () => emptyIR,
    getThreadRef: () => currentThread,
    setThreadRef: (next) => {
      currentThread = next;
    },
    markThreadDesynced: (next, reason) => {
      desynced.push({ thread: next, reason });
    },
  });

  return { driver, turnSent, desynced, getThread: () => currentThread };
}

describe('SchemaAgentDriver', () => {
  it('starts a provider thread, maps canonical events, and commits the renderer turn', async () => {
    const runtime = makeRuntime([
      { type: 'assistant_delta', text: 'Adding ' },
      { type: 'tool_call_started', id: 'tool-1', name: 'add_type', input: { name: 'Plot' } },
      { type: 'tool_call_finished', id: 'tool-1', name: 'add_type', ok: true },
      { type: 'turn_completed' },
    ]);
    const { transport, sent } = fakeTransport();
    const { driver, turnSent, getThread } = makeDriver(runtime, transport);

    await driver.send('add a Plot type');

    expect(runtime.startThread).toHaveBeenCalledWith({ schema: emptyIR });
    expect(runtime.rollbackThread).not.toHaveBeenCalled();
    expect(getThread()).toEqual(thread);
    expect(turnSent.map((s) => s.channel)).toEqual(['turn:begin', 'turn:commit']);
    expect(sent.map((s) => s.channel)).toEqual([
      SCHEMA_AGENT_THREAD_UPDATED,
      SCHEMA_AGENT_ASSISTANT_DELTA,
      SCHEMA_AGENT_TOOL_CALL_STARTED,
      SCHEMA_AGENT_TOOL_CALL_FINISHED,
    ]);
  });

  it('rolls back renderer and provider state when the provider reports turn failure', async () => {
    const runtime = makeRuntime([
      { type: 'assistant_delta', text: 'Starting' },
      { type: 'turn_failed', message: 'tool call failed' },
    ]);
    const { transport, sent } = fakeTransport();
    const { driver, turnSent } = makeDriver(runtime, transport);

    await expect(driver.send('add a Plot type')).rejects.toThrow('tool call failed');

    expect(turnSent.map((s) => s.channel)).toEqual(['turn:begin', 'turn:rollback']);
    expect(runtime.rollbackThread).toHaveBeenCalledWith({ thread, turns: 1 });
    expect(sent.at(-1)).toEqual({
      channel: SCHEMA_AGENT_ERROR,
      payload: { message: 'tool call failed' },
    });
  });

  it('marks the thread desynced if provider rollback fails', async () => {
    const runtime = makeRuntime([{ type: 'turn_interrupted', message: 'stopped' }]);
    vi.mocked(runtime.rollbackThread).mockRejectedValue(new Error('rollback unavailable'));
    const { transport, sent } = fakeTransport();
    const { driver, desynced } = makeDriver(runtime, transport);

    await expect(driver.send('stop')).rejects.toThrow('stopped');

    expect(desynced).toEqual([{ thread, reason: 'rollback unavailable' }]);
    expect(sent).toContainEqual({
      channel: SCHEMA_AGENT_THREAD_DESYNCED,
      payload: { thread, reason: 'rollback unavailable' },
    });
    expect(sent.at(-1)).toEqual({
      channel: SCHEMA_AGENT_ERROR,
      payload: { message: 'stopped' },
    });
  });
});
