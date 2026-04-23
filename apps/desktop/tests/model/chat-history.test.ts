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

  it('round-trips the optional sessionId when present', () => {
    const history = {
      version: '1' as const,
      messages: [{ id: 'm1', role: 'user' as const, content: 'hi', createdAt: 1 }],
      sessionId: 'sess-abc-123',
    };
    const raw = saveChatHistory(history);
    const { history: round, warnings } = loadChatHistory(raw);
    expect(round).toEqual(history);
    expect(round.sessionId).toBe('sess-abc-123');
    expect(warnings).toEqual([]);
  });

  it('treats sessionId as absent when not a string', () => {
    const raw = JSON.stringify({
      version: '1',
      messages: [],
      sessionId: 12345, // invalid: numbers are dropped
    });
    const { history, warnings } = loadChatHistory(raw);
    expect(history.sessionId).toBeUndefined();
    // Warnings are reserved for version/JSON discards; bad sessionId
    // is silently ignored because the sidecar could have been
    // hand-edited and we don't want to spam the user.
    expect(warnings).toEqual([]);
  });

  it('loads without a sessionId field at all', () => {
    const raw = JSON.stringify({
      version: '1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
    });
    const { history } = loadChatHistory(raw);
    expect(history.sessionId).toBeUndefined();
    expect(history.messages).toHaveLength(1);
  });
});
