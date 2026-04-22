import { ChatTurnController, type TurnTransport } from '@main/ipc/chat-turn';
import { describe, expect, it, vi } from 'vitest';

function fakeTransport() {
  const sent: Array<{ channel: string; payload?: unknown }> = [];
  const transport: TurnTransport = {
    send: (channel, payload) => {
      sent.push({ channel, payload });
    },
  };
  return { transport, sent };
}

describe('ChatTurnController', () => {
  it('sends "turn:begin" then "turn:commit" around a turn', async () => {
    const { transport, sent } = fakeTransport();
    const controller = new ChatTurnController(transport);

    await controller.run(async () => {
      // Simulate running a few ops mid-turn.
      expect(sent.at(-1)?.channel).toBe('turn:begin');
    });

    expect(sent.map((s) => s.channel)).toEqual(['turn:begin', 'turn:commit']);
  });

  it('sends "turn:begin" then "turn:rollback" when the body throws', async () => {
    const { transport, sent } = fakeTransport();
    const controller = new ChatTurnController(transport);

    await expect(
      controller.run(async () => {
        throw new Error('oops');
      }),
    ).rejects.toThrow('oops');

    expect(sent.map((s) => s.channel)).toEqual(['turn:begin', 'turn:rollback']);
  });

  it('is re-entrancy safe: a second run() only fires after the first completes', async () => {
    const { transport, sent } = fakeTransport();
    const controller = new ChatTurnController(transport);
    const hold = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    await Promise.all([controller.run(hold), controller.run(hold)]);
    // Each turn gets its own begin/commit pair; they never nest.
    expect(sent.map((s) => s.channel)).toEqual([
      'turn:begin',
      'turn:commit',
      'turn:begin',
      'turn:commit',
    ]);
  });
});
