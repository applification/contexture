/**
 * ChatDriver — per-turn orchestration.
 *
 * Proves the driver:
 *   - wraps the turn in `turn:begin` / `turn:commit`,
 *   - streams assistant / tool-use / result messages to the renderer,
 *   - sends `turn:rollback` and a `chat:error` when the SDK stream
 *     throws mid-flight,
 *   - passes the current IR into the system prompt.
 *
 * No Electron, no SDK — the transport, query function, and turn
 * controller are all test doubles.
 */
import {
  CHAT_ASSISTANT,
  CHAT_ERROR,
  CHAT_RESULT,
  CHAT_TOOL_USE,
  ChatDriver,
  type DriverQueryFn,
  type DriverTransport,
} from '@main/ipc/chat-driver';
import { ChatTurnController } from '@main/ipc/chat-turn';
import type { Schema } from '@renderer/model/types';
import { describe, expect, it, vi } from 'vitest';

function fakeTransport(): {
  transport: DriverTransport;
  sent: Array<{ channel: string; payload: unknown }>;
} {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  return {
    transport: { send: (channel, payload) => sent.push({ channel, payload }) },
    sent,
  };
}

const emptyIR: Schema = { version: '1', types: [] };
const stdlibRegistry = { entries: [] };

describe('ChatDriver', () => {
  it('wraps the stream in turn:begin / turn:commit and emits assistant/tool-use/result', async () => {
    const { transport: turnTransport, sent: turnSent } = fakeTransport();
    const { transport: driverTransport, sent: driverSent } = fakeTransport();
    const turnController = new ChatTurnController({
      send: (channel, payload) => turnTransport.send(channel, payload),
    });

    const query: DriverQueryFn = async function* () {
      yield { type: 'assistant', text: 'hello' };
      yield { type: 'tool_use', name: 'add_type', input: { name: 'Plot' } };
      yield { type: 'result', ok: true };
    };

    const driver = new ChatDriver({
      query,
      transport: driverTransport,
      turnController,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
    });

    await driver.send('add a Plot type');

    expect(turnSent.map((s) => s.channel)).toEqual(['turn:begin', 'turn:commit']);
    expect(driverSent.map((s) => s.channel)).toEqual([CHAT_ASSISTANT, CHAT_TOOL_USE, CHAT_RESULT]);
    expect(driverSent[0].payload).toEqual({ text: 'hello' });
    expect(driverSent[1].payload).toEqual({ name: 'add_type', input: { name: 'Plot' } });
    expect(driverSent[2].payload).toEqual({ ok: true, error: undefined });
  });

  it('rolls back the turn and emits chat:error when the stream throws', async () => {
    const { transport: turnTransport, sent: turnSent } = fakeTransport();
    const { transport: driverTransport, sent: driverSent } = fakeTransport();
    const turnController = new ChatTurnController({
      send: (channel, payload) => turnTransport.send(channel, payload),
    });

    const query: DriverQueryFn = async function* () {
      yield { type: 'assistant', text: 'starting' };
      throw new Error('network died');
    };

    const driver = new ChatDriver({
      query,
      transport: driverTransport,
      turnController,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
    });

    await expect(driver.send('hi')).rejects.toThrow('network died');

    expect(turnSent.map((s) => s.channel)).toEqual(['turn:begin', 'turn:rollback']);
    expect(driverSent.map((s) => s.channel)).toEqual([CHAT_ASSISTANT, CHAT_ERROR]);
    expect((driverSent[1].payload as { message: string }).message).toBe('network died');
  });

  it('builds the system prompt from the current IR each turn', async () => {
    const { transport: driverTransport } = fakeTransport();
    const turnController = new ChatTurnController({ send: () => undefined });
    const query = vi.fn<DriverQueryFn>(async function* () {
      yield { type: 'result', ok: true };
    });

    const ir: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Plot', fields: [] }],
    };
    const driver = new ChatDriver({
      query,
      transport: driverTransport,
      turnController,
      getCurrentIR: () => ir,
      stdlibRegistry,
    });

    await driver.send('hello');

    expect(query).toHaveBeenCalledTimes(1);
    const input = query.mock.calls[0][0];
    expect(input.prompt).toBe('hello');
    // System prompt should embed the IR so Claude sees the current schema.
    expect(input.systemPrompt).toContain('"name": "Plot"');
  });

  it('falls back to an empty IR if the current IR is null', async () => {
    const { transport: driverTransport } = fakeTransport();
    const turnController = new ChatTurnController({ send: () => undefined });
    const query = vi.fn<DriverQueryFn>(async function* () {
      yield { type: 'result', ok: true };
    });

    const driver = new ChatDriver({
      query,
      transport: driverTransport,
      turnController,
      getCurrentIR: () => null,
      stdlibRegistry,
    });

    await driver.send('hi');

    const input = query.mock.calls[0][0];
    expect(input.systemPrompt).toContain('"types": []');
  });
});
