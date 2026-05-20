import { useSchemaAgentSessionStore } from '@renderer/chat/schemaAgentSessionStore';
import { beforeEach, describe, expect, it } from 'vitest';

const USER_MESSAGE = { id: 'u', role: 'user' as const, content: 'hello', createdAt: 1 };
const ASSISTANT_MESSAGE = { id: 'a', role: 'assistant' as const, content: 'done', createdAt: 2 };
const THREAD = { provider: 'codex', threadId: 'thread-1' };

beforeEach(() => {
  useSchemaAgentSessionStore.getState().reset();
});

describe('schema agent session store', () => {
  it('begins and finishes a streaming turn as one session lifecycle', () => {
    useSchemaAgentSessionStore.getState().beginTurn(USER_MESSAGE);

    expect(useSchemaAgentSessionStore.getState()).toMatchObject({
      messages: [USER_MESSAGE],
      isStreaming: true,
      liveAssistant: '',
      authRequired: false,
    });

    useSchemaAgentSessionStore.getState().setLiveAssistant('draft');
    useSchemaAgentSessionStore.getState().finishAssistant(ASSISTANT_MESSAGE);

    expect(useSchemaAgentSessionStore.getState()).toMatchObject({
      messages: [USER_MESSAGE, ASSISTANT_MESSAGE],
      isStreaming: false,
      liveAssistant: '',
    });
  });

  it('hydrates chat history with provider thread state', () => {
    useSchemaAgentSessionStore.getState().hydrateHistoryState({
      version: '1',
      messages: [USER_MESSAGE],
      providerThreadRef: THREAD,
    });

    expect(useSchemaAgentSessionStore.getState()).toMatchObject({
      messages: [USER_MESSAGE],
      providerThreadRef: THREAD,
      desynced: false,
      isStreaming: false,
      authRequired: false,
    });
  });

  it('records turn failures and auth-required state together', () => {
    useSchemaAgentSessionStore.getState().beginTurn(USER_MESSAGE);
    useSchemaAgentSessionStore.getState().failTurn(ASSISTANT_MESSAGE, true);

    expect(useSchemaAgentSessionStore.getState()).toMatchObject({
      messages: [USER_MESSAGE, ASSISTANT_MESSAGE],
      isStreaming: false,
      authRequired: true,
    });

    useSchemaAgentSessionStore.getState().clearAuthRequired();
    expect(useSchemaAgentSessionStore.getState().authRequired).toBe(false);
  });
});
