import { DEFAULT_CHAT_HISTORY, loadChatHistory, saveChatHistory } from '@contexture/core';
import { describe, expect, it } from 'vitest';

describe('chat history sidecar', () => {
  it('round-trips messages through save/load', () => {
    const history = {
      version: '1' as const,
      messages: [
        { id: 'm1', role: 'user' as const, content: 'add Allotment', createdAt: 1000 },
        { id: 'm2', role: 'assistant' as const, content: 'ok', createdAt: 1100 },
      ],
    };
    const raw = saveChatHistory(history);
    const { history: round, warnings } = loadChatHistory(raw);
    expect(round).toEqual(history);
    expect(warnings).toEqual([]);
  });

  it('discards unknown-version files and returns defaults with a warning', () => {
    const raw = JSON.stringify({
      version: '99',
      messages: [{ id: 'm', role: 'user', content: 'x', createdAt: 1 }],
    });
    const { history, warnings } = loadChatHistory(raw);
    expect(history).toEqual(DEFAULT_CHAT_HISTORY);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/99/);
    expect(warnings[0]).toMatch(/discard/i);
  });

  it('discards malformed JSON without throwing', () => {
    const { history, warnings } = loadChatHistory('{not json');
    expect(history).toEqual(DEFAULT_CHAT_HISTORY);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/invalid json/i);
  });

  it('round-trips provider metadata and opaque provider thread refs', () => {
    const history = {
      version: '1' as const,
      provider: 'codex' as const,
      model: 'gpt-5.4',
      effort: 'high',
      providerThreadRef: {
        provider: 'codex',
        threadId: 'thread-1',
        opaque: { currentTurnId: 't1' },
      },
      messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 1 }],
    };
    const raw = saveChatHistory(history);
    const { history: round, warnings } = loadChatHistory(raw);

    expect(round).toEqual(history);
    expect(warnings).toEqual([]);
  });

  it('round-trips agent turn records', () => {
    const history = {
      version: '1' as const,
      messages: [{ id: 'm1', role: 'user' as const, content: 'add Plot', createdAt: 1 }],
      agentTurns: [
        {
          id: 'turn-1',
          status: 'committed' as const,
          startedAt: '2026-05-29T09:00:00.000Z',
          finishedAt: '2026-05-29T09:00:01.000Z',
          ops: [
            {
              id: 'op-1',
              name: 'add_type',
              status: 'applied' as const,
              op: {
                kind: 'add_type' as const,
                type: { kind: 'object' as const, name: 'Plot', fields: [] },
              },
            },
          ],
          summary: 'Agent applied 1 model change',
        },
      ],
    };
    const raw = saveChatHistory(history);
    const { history: round, warnings } = loadChatHistory(raw);

    expect(round).toEqual(history);
    expect(warnings).toEqual([]);
  });

  it('drops malformed agent turn snapshots and ops without discarding chat history', () => {
    const raw = JSON.stringify({
      version: '1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      agentTurns: [
        {
          id: 'turn-1',
          status: 'committed',
          startedAt: '2026-05-29T09:00:00.000Z',
          before: {},
          after: { version: '1', types: [] },
          ops: [
            { id: 'op-1', name: 'add_type', status: 'applied', op: { kind: 'not_real' } },
            { id: 'op-2', name: 'emit_contexture', status: 'non_op', result: { emitted: [] } },
          ],
          summary: 'Agent applied 1 model change',
        },
      ],
    });
    const { history, warnings } = loadChatHistory(raw);

    expect(history.messages).toHaveLength(1);
    expect(history.agentTurns?.[0]?.before).toBeUndefined();
    expect(history.agentTurns?.[0]?.after).toEqual({ version: '1', types: [] });
    expect(history.agentTurns?.[0]?.ops).toEqual([
      expect.objectContaining({ id: 'op-1', name: 'add_type', status: 'applied' }),
      expect.objectContaining({ id: 'op-2', name: 'emit_contexture', status: 'non_op' }),
    ]);
    expect(history.agentTurns?.[0]?.ops[0]?.op).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('ignores unknown sidecar fields', () => {
    const raw = JSON.stringify({
      version: '1',
      messages: [],
      extra: 'not part of the sidecar contract',
    });
    const { history, warnings } = loadChatHistory(raw);
    expect(history).toEqual(DEFAULT_CHAT_HISTORY);
    expect(warnings).toEqual([]);
  });
});
