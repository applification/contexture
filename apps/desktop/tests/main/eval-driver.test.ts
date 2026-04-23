/**
 * EvalDriver — happy-path sample capture, error bubbling, and the
 * "no emit_sample" guard.
 */
import {
  EVAL_ASSISTANT,
  EVAL_ERROR,
  EVAL_RESULT,
  EVAL_SAMPLE,
  EvalDriver,
  type EvalQueryFn,
  type EvalTransport,
} from '@main/ipc/eval-driver';
import { describe, expect, it } from 'vitest';

function fakeTransport() {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const transport: EvalTransport = {
    send: (channel, payload) => sent.push({ channel, payload }),
  };
  return { transport, sent };
}

describe('EvalDriver', () => {
  it('captures the emit_sample argument and forwards to the transport', async () => {
    const { transport, sent } = fakeTransport();
    const query: EvalQueryFn = async function* () {
      yield { type: 'assistant', text: 'ok' };
      yield { type: 'tool_input', sample: { name: 'Plot' } };
      yield { type: 'result' };
    };
    const driver = new EvalDriver({ query, transport });

    const result = await driver.generate({
      rootTypeName: 'Plot',
      rootJsonSchema: { type: 'object' },
      mode: 'realistic',
      systemPrompt: '…',
    });

    expect(result.sample).toEqual({ name: 'Plot' });
    expect(result.text).toBe('ok');
    expect(sent.map((s) => s.channel)).toEqual([EVAL_ASSISTANT, EVAL_SAMPLE, EVAL_RESULT]);
  });

  it('surfaces an emitted error message and re-throws', async () => {
    const { transport, sent } = fakeTransport();
    const query: EvalQueryFn = async function* () {
      yield { type: 'error', message: 'model said no' };
    };
    const driver = new EvalDriver({ query, transport });
    await expect(
      driver.generate({
        rootTypeName: 'X',
        rootJsonSchema: {},
        mode: 'minimal',
        systemPrompt: '…',
      }),
    ).rejects.toThrow('model said no');
    expect(sent.map((s) => s.channel)).toContain(EVAL_ERROR);
  });

  it('rejects when the stream never calls emit_sample', async () => {
    const { transport } = fakeTransport();
    const query: EvalQueryFn = async function* () {
      yield { type: 'assistant', text: 'forgot to call tool' };
      yield { type: 'result' };
    };
    const driver = new EvalDriver({ query, transport });
    await expect(
      driver.generate({
        rootTypeName: 'X',
        rootJsonSchema: {},
        mode: 'minimal',
        systemPrompt: '…',
      }),
    ).rejects.toThrow(/emit_sample/);
  });
});
