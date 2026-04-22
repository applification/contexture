import {
  DEFAULT_CHAT_HISTORY,
  loadChatHistory,
  saveChatHistory,
} from '@renderer/model/chat-history';
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
});
