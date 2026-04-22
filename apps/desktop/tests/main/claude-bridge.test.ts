import { type BridgeTransport, makeIpcForwardOp, TurnContext } from '@main/ipc/claude-bridge';
import type { Op } from '@renderer/store/ops';
import { describe, expect, it } from 'vitest';

describe('makeIpcForwardOp', () => {
  it('sends the op to the renderer and awaits its ApplyResult', async () => {
    const transport = fakeTransport();
    const forward = makeIpcForwardOp(transport);

    // Queue the renderer's reply for the next request.
    transport.reply({ schema: { version: '1', types: [] } });

    const op: Op = { kind: 'delete_type', name: 'X' };
    const result = await forward(op);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].payload).toEqual(op);
    expect(result).toEqual({ schema: { version: '1', types: [] } });
  });

  it('assigns a unique correlation id per request', async () => {
    const transport = fakeTransport();
    const forward = makeIpcForwardOp(transport);
    transport.reply({ error: 'a' });
    transport.reply({ error: 'b' });
    await forward({ kind: 'delete_type', name: 'A' });
    await forward({ kind: 'delete_type', name: 'B' });
    expect(transport.sent[0].id).not.toBe(transport.sent[1].id);
  });

  it('rejects if the renderer never replies within the timeout', async () => {
    const transport = fakeTransport();
    const forward = makeIpcForwardOp(transport, { timeoutMs: 10 });
    await expect(forward({ kind: 'delete_type', name: 'X' })).rejects.toThrow(/timed out/i);
  });
});

describe('TurnContext', () => {
  it('stores the IR pushed by the renderer for the current turn', () => {
    const ctx = new TurnContext();
    expect(ctx.current()).toBeNull();
    ctx.pushIR({ version: '1', types: [] });
    expect(ctx.current()).toEqual({ version: '1', types: [] });
    ctx.pushIR({ version: '1', types: [{ kind: 'object', name: 'X', fields: [] }] });
    expect(ctx.current()?.types).toHaveLength(1);
  });
});

// --- helpers ------------------------------------------------------------

function fakeTransport() {
  const sent: Array<{ id: string; payload: unknown }> = [];
  const replyQueue: unknown[] = [];

  const transport: BridgeTransport & {
    sent: typeof sent;
    reply: (result: unknown) => void;
  } = {
    send: (id, payload) => {
      sent.push({ id, payload });
      if (replyQueue.length > 0) {
        const reply = replyQueue.shift();
        // Read `onReply` lazily so we see the value installed by
        // `makeIpcForwardOp` after construction.
        queueMicrotask(() => transport.onReply?.(id, reply));
      }
    },
    sent,
    reply: (result) => {
      replyQueue.push(result);
    },
  };

  return transport;
}
