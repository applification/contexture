/**
 * ChatSession — boundary tests for the deepened chat orchestrator.
 *
 * Replaces the old chat-driver.test.ts. Tests run against a `FakeSdk` and
 * a recording sink; no Electron, no real SDK.
 */

import {
  ChatSession,
  type DriverSdkMessage,
  type EventSinkPort,
  type SdkPort,
  type SdkQueryRun,
  type TurnEvent,
} from '@main/chat/chat-session';
import { ChatCancelledError } from '@main/ipc/claude-errors';
import type { Schema } from '@renderer/model/ir';
import { describe, expect, it } from 'vitest';

const emptyIR: Schema = { version: '1', types: [] };
const stdlibRegistry = { entries: [] };

function recordingSink(): { sink: EventSinkPort; events: TurnEvent[] } {
  const events: TurnEvent[] = [];
  return { sink: { emit: (e) => events.push(e) }, events };
}

function scriptedRun(messages: AsyncIterable<DriverSdkMessage>): SdkQueryRun {
  return { stream: messages, cancel: async () => undefined };
}

function scriptedSdk(
  script: () => AsyncGenerator<DriverSdkMessage>,
  onCancel?: (run: SdkQueryRun) => Promise<void>,
): SdkPort {
  return {
    query() {
      const stream = script();
      const run: SdkQueryRun = {
        stream,
        cancel: async () => {
          if (onCancel) await onCancel(run);
          // Mirror the real SDK's `interrupt()` behaviour: return the
          // iterator. The session raises `ChatCancelledError` after the
          // loop exits because `cancelRequested` is set.
          await stream.return(undefined as unknown as DriverSdkMessage);
        },
      };
      return run;
    },
  };
}

const testClock = {
  sleep: async () => undefined,
  random: () => 0.5,
};

function kinds(events: TurnEvent[]): TurnEvent['kind'][] {
  return events.map((e) => e.kind);
}

describe('ChatSession', () => {
  it('happy path: emits turn-begin → assistant → tool-use → result → session → turn-commit', async () => {
    const { sink, events } = recordingSink();
    const sdk = scriptedSdk(async function* () {
      yield { type: 'assistant', text: 'hello' };
      yield { type: 'tool_use', name: 'add_type', input: { name: 'Plot' } };
      yield { type: 'result', ok: true };
      yield { type: 'session', sessionId: 'sess-1' };
    });

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    const result = await session.turn('add a Plot type');

    expect(result.status).toBe('ok');
    expect(result.sessionId).toBe('sess-1');
    expect(kinds(events)).toEqual([
      'turn-begin',
      'assistant',
      'tool-use',
      'result',
      'session',
      'turn-commit',
    ]);
    expect(events[1]).toEqual({ kind: 'assistant', textDelta: 'hello' });
    expect(events[2]).toEqual({
      kind: 'tool-use',
      name: 'add_type',
      input: { name: 'Plot' },
    });
  });

  it('retries a transient error before the first SDK message, succeeds on 3rd attempt', async () => {
    const { sink, events } = recordingSink();
    let attempts = 0;
    const sdk = scriptedSdk(async function* () {
      attempts += 1;
      if (attempts < 3) throw new Error('ECONNRESET');
      yield { type: 'assistant', text: 'hi' };
      yield { type: 'result', ok: true };
    });

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    const result = await session.turn('hi');

    expect(attempts).toBe(3);
    expect(result.status).toBe('ok');
    expect(kinds(events)).toEqual(['turn-begin', 'assistant', 'result', 'turn-commit']);
  });

  it('does NOT retry a transient error after the first SDK message; rolls back as exhausted', async () => {
    const { sink, events } = recordingSink();
    let attempts = 0;
    const sdk = scriptedSdk(async function* () {
      attempts += 1;
      yield { type: 'assistant', text: 'partial' };
      throw new Error('ECONNRESET');
    });

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    const result = await session.turn('hi');

    expect(attempts).toBe(1);
    expect(result.status).toBe('error');
    expect(result.failure?.class).toBe('exhausted');
    const kindSeq = kinds(events);
    expect(kindSeq[0]).toBe('turn-begin');
    expect(kindSeq).toContain('error');
    expect(kindSeq).toContain('turn-rollback');
    expect(kindSeq).not.toContain('turn-commit');
  });

  it('routes an auth error to auth-required (not error); rolls back', async () => {
    const { sink, events } = recordingSink();
    // biome-ignore lint/correctness/useYield: throw-only generator exercises the error path
    const sdk = scriptedSdk(async function* () {
      throw new Error('401 Unauthorized');
    });

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    const result = await session.turn('hi');

    expect(result.status).toBe('error');
    expect(result.failure?.class).toBe('auth');
    const kindSeq = kinds(events);
    expect(kindSeq).toContain('auth-required');
    expect(kindSeq).not.toContain('error');
    expect(kindSeq).toContain('turn-rollback');
  });

  it('routes a validation error to error with the Zod message; rolls back', async () => {
    const { sink, events } = recordingSink();
    const sdk = scriptedSdk(async function* () {
      yield { type: 'assistant', text: 'starting' };
      throw new Error('ZodError: invalid payload');
    });

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    const result = await session.turn('hi');

    expect(result.status).toBe('error');
    expect(result.failure?.class).toBe('validation');
    const errEvent = events.find((e) => e.kind === 'error');
    expect(errEvent).toBeDefined();
    if (errEvent?.kind !== 'error') throw new Error('expected error event');
    expect(errEvent.message).toContain('ZodError');
  });

  it('cancel: silent rollback, no error event', async () => {
    const { sink, events } = recordingSink();
    const sdk = scriptedSdk(async function* () {
      yield { type: 'assistant', text: 'starting' };
      throw new ChatCancelledError();
    });

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    const result = await session.turn('hi');

    expect(result.status).toBe('cancelled');
    const kindSeq = kinds(events);
    expect(kindSeq).not.toContain('error');
    expect(kindSeq).not.toContain('auth-required');
    expect(kindSeq).toContain('turn-rollback');
  });

  it('cancel() triggers SDK cancel and the turn unwinds silently', async () => {
    const { sink, events } = recordingSink();
    let cancelled = false;
    const sdk = scriptedSdk(
      async function* () {
        yield { type: 'assistant', text: 'starting' };
        // Wait forever unless cancelled.
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield { type: 'result', ok: true };
      },
      async () => {
        cancelled = true;
      },
    );

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    const turnPromise = session.turn('hi');
    // Wait for the first message to land so the loop is in the await.
    await new Promise((resolve) => setTimeout(resolve, 10));
    session.cancel();

    const result = await turnPromise;
    expect(cancelled).toBe(true);
    expect(result.status).toBe('cancelled');
    expect(kinds(events)).not.toContain('error');
    expect(kinds(events)).toContain('turn-rollback');
  });

  it('resume: second turn passes the resumeId captured from the first turn', async () => {
    const { sink } = recordingSink();
    const calls: Array<{ resume?: string }> = [];
    const sdk: SdkPort = {
      query(input) {
        calls.push({ resume: input.resume });
        return scriptedRun(
          (async function* () {
            yield { type: 'session', sessionId: 'sess-first' };
            yield { type: 'result', ok: true };
          })(),
        );
      },
    };

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    await session.turn('first');
    await session.turn('second');

    expect(calls[0].resume).toBeUndefined();
    expect(calls[1].resume).toBe('sess-first');
    expect(session.state.resumeId).toBe('sess-first');
  });

  it('concurrent turns: second turn queues until the first finishes (no overlap)', async () => {
    const { sink, events } = recordingSink();
    let inFlightCount = 0;
    let peakConcurrency = 0;
    const sdk: SdkPort = {
      query() {
        return scriptedRun(
          (async function* () {
            inFlightCount += 1;
            peakConcurrency = Math.max(peakConcurrency, inFlightCount);
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield { type: 'result', ok: true };
            inFlightCount -= 1;
          })(),
        );
      },
    };

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    const [r1, r2] = await Promise.all([session.turn('first'), session.turn('second')]);

    expect(r1.status).toBe('ok');
    expect(r2.status).toBe('ok');
    expect(peakConcurrency).toBe(1);
    // Two full envelopes, in order.
    expect(kinds(events).filter((k) => k.startsWith('turn'))).toEqual([
      'turn-begin',
      'turn-commit',
      'turn-begin',
      'turn-commit',
    ]);
  });

  it('embeds the current IR in the prompt and builds the system-prompt append', async () => {
    const { sink } = recordingSink();
    const captured: Array<{ prompt: string; systemPromptAppend: string }> = [];
    const sdk: SdkPort = {
      query(input) {
        captured.push({ prompt: input.prompt, systemPromptAppend: input.systemPromptAppend });
        return scriptedRun(
          (async function* () {
            yield { type: 'result', ok: true };
          })(),
        );
      },
    };

    const ir: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Plot', fields: [] }],
    };
    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => ir,
      stdlibRegistry,
      clock: testClock,
    });

    await session.turn('hello');

    expect(captured).toHaveLength(1);
    expect(captured[0].prompt).toContain('<current_ir>');
    expect(captured[0].prompt).toContain('"name": "Plot"');
    expect(captured[0].prompt).toContain('hello');
    expect(captured[0].systemPromptAppend).toContain('add_type');
  });

  it('auth/model setters are applied to the next query', async () => {
    const { sink } = recordingSink();
    const calls: Array<{
      auth: { mode: string };
      model: string;
      thinkingBudget: string;
    }> = [];
    const sdk: SdkPort = {
      query(input) {
        calls.push({
          auth: input.auth,
          model: input.model,
          thinkingBudget: input.thinkingBudget,
        });
        return scriptedRun(
          (async function* () {
            yield { type: 'result', ok: true };
          })(),
        );
      },
    };

    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    session.setAuth({ mode: 'api-key', key: 'sk-test' });
    session.setModel('claude-opus-4-6', 'high');
    await session.turn('hi');

    expect(calls[0].auth).toEqual({ mode: 'api-key', key: 'sk-test' });
    expect(calls[0].model).toBe('claude-opus-4-6');
    expect(calls[0].thinkingBudget).toBe('high');
  });

  it('reset() drops the resumeId', async () => {
    const { sink } = recordingSink();
    const sdk: SdkPort = {
      query() {
        return scriptedRun(
          (async function* () {
            yield { type: 'session', sessionId: 'sess-x' };
            yield { type: 'result', ok: true };
          })(),
        );
      },
    };
    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    await session.turn('first');
    expect(session.state.resumeId).toBe('sess-x');
    session.reset();
    expect(session.state.resumeId).toBeUndefined();
  });

  it('resumeFrom() seeds the resumeId (sidecar hydration)', () => {
    const { sink } = recordingSink();
    const sdk: SdkPort = {
      query() {
        return scriptedRun(
          (async function* () {
            yield { type: 'result', ok: true };
          })(),
        );
      },
    };
    const session = new ChatSession({
      sdk,
      sink,
      getCurrentIR: () => emptyIR,
      stdlibRegistry,
      clock: testClock,
    });

    session.resumeFrom('from-sidecar');
    expect(session.state.resumeId).toBe('from-sidecar');
  });
});
