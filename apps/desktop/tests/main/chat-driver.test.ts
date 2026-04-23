/**
 * ChatDriver — per-turn orchestration.
 *
 * Proves the driver:
 *   - wraps the turn in `turn:begin` / `turn:commit`,
 *   - streams assistant / tool-use / result / session messages,
 *   - sends `turn:rollback` and a `chat:error` when the SDK stream
 *     throws mid-flight,
 *   - embeds the current IR in the user-message prefix each turn,
 *   - passes `resume` to the query function when a prior sessionId
 *     is known and omits it otherwise.
 *
 * No Electron, no SDK — the transport, query function, and turn
 * controller are all test doubles.
 */
import {
  CHAT_ASSISTANT,
  CHAT_ERROR,
  CHAT_RESULT,
  CHAT_SESSION,
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
      getResumeSessionId: () => undefined,
    });

    await driver.send('add a Plot type');

    expect(turnSent.map((s) => s.channel)).toEqual(['turn:begin', 'turn:commit']);
    expect(driverSent.map((s) => s.channel)).toEqual([CHAT_ASSISTANT, CHAT_TOOL_USE, CHAT_RESULT]);
    expect(driverSent[0].payload).toEqual({ text: 'hello' });
    expect(driverSent[1].payload).toEqual({ name: 'add_type', input: { name: 'Plot' } });
    expect(driverSent[2].payload).toEqual({ ok: true, error: undefined });
  });

  it('forwards session-id messages to the renderer via chat:session', async () => {
    const { transport: driverTransport, sent: driverSent } = fakeTransport();
    const turnController = new ChatTurnController({ send: () => undefined });

    const query: DriverQueryFn = async function* () {
      yield { type: 'session', sessionId: 'sess-abc' };
      yield { type: 'assistant', text: 'ok' };
      yield { type: 'result', ok: true };
    };

    const driver = new ChatDriver({
      query,
      transport: driverTransport,
      turnController,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      getResumeSessionId: () => undefined,
    });

    await driver.send('hi');

    const session = driverSent.find((s) => s.channel === CHAT_SESSION);
    expect(session).toBeDefined();
    expect(session?.payload).toEqual({ sessionId: 'sess-abc' });
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
      getResumeSessionId: () => undefined,
    });

    await expect(driver.send('hi')).rejects.toThrow('network died');

    expect(turnSent.map((s) => s.channel)).toEqual(['turn:begin', 'turn:rollback']);
    expect(driverSent.map((s) => s.channel)).toEqual([CHAT_ASSISTANT, CHAT_ERROR]);
    expect((driverSent[1].payload as { message: string }).message).toBe('network died');
  });

  it('builds the user-message prefix with the current IR each turn', async () => {
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
      getResumeSessionId: () => undefined,
    });

    await driver.send('hello');

    expect(query).toHaveBeenCalledTimes(1);
    const input = query.mock.calls[0][0];
    // Prompt wraps the IR in <current_ir> and appends the user text.
    expect(input.prompt).toContain('<current_ir>');
    expect(input.prompt).toContain('"name": "Plot"');
    expect(input.prompt).toContain('</current_ir>');
    expect(input.prompt).toContain('hello');
    // Append body (skills + ops + stdlib) is passed separately.
    expect(input.systemPromptAppend).toContain('add_type');
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
      getResumeSessionId: () => undefined,
    });

    await driver.send('hi');

    const input = query.mock.calls[0][0];
    expect(input.prompt).toContain('"types": []');
  });

  it('passes resume when getResumeSessionId returns a value; omits it otherwise', async () => {
    const { transport: driverTransport } = fakeTransport();
    const turnController = new ChatTurnController({ send: () => undefined });
    const query = vi.fn<DriverQueryFn>(async function* () {
      yield { type: 'result', ok: true };
    });

    const withResume = new ChatDriver({
      query,
      transport: driverTransport,
      turnController,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      getResumeSessionId: () => 'sess-123',
    });
    await withResume.send('first');
    expect(query.mock.calls[0][0].resume).toBe('sess-123');

    query.mockClear();
    const withoutResume = new ChatDriver({
      query,
      transport: driverTransport,
      turnController,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      getResumeSessionId: () => undefined,
    });
    await withoutResume.send('first');
    expect(query.mock.calls[0][0].resume).toBeUndefined();
  });
});
