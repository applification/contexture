import { useChatComposerStore } from '@renderer/store/chat-composer';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('chat history persistence setting', () => {
  it('defaults to enabled and can be toggled off and back on', () => {
    const { result } = renderHook(() => useChatComposerStore());
    // Default: on.
    expect(result.current.chatHistoryPersistence).toBe(true);

    act(() => {
      result.current.setChatHistoryPersistence(false);
    });
    expect(result.current.chatHistoryPersistence).toBe(false);

    act(() => {
      result.current.setChatHistoryPersistence(true);
    });
    expect(result.current.chatHistoryPersistence).toBe(true);
  });
});
