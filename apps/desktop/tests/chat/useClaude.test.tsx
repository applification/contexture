/**
 * `useClaude` — auth + readiness state + IPC push.
 */
import { useClaude } from '@renderer/chat/useClaude';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEYS = ['contexture-claude-auth-mode', 'contexture-claude-api-key'];

beforeEach(() => {
  for (const k of STORAGE_KEYS) localStorage.removeItem(k);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockChatBridge(options: { installed: boolean; setAuth?: ReturnType<typeof vi.fn> }): void {
  const setAuth = options.setAuth ?? vi.fn(async () => ({ ok: true }));
  (window as unknown as { contexture: unknown }).contexture = {
    chat: {
      detectClaudeCli: vi.fn(async () => ({
        installed: options.installed,
        path: options.installed ? '/usr/local/bin/claude' : null,
      })),
      setAuth,
    },
  };
}

describe('useClaude', () => {
  it('defaults to Max mode + ready when the CLI is installed on first launch', async () => {
    mockChatBridge({ installed: true });
    const { result } = renderHook(() => useClaude());
    await waitFor(() => expect(result.current.cliDetected).toBe(true));
    expect(result.current.authMode).toBe('max');
    expect(result.current.isReady).toBe(true);
  });

  it('defaults to api-key mode + not ready when CLI missing and no key', async () => {
    mockChatBridge({ installed: false });
    const { result } = renderHook(() => useClaude());
    await waitFor(() => expect(result.current.authMode).toBe('api-key'));
    expect(result.current.isReady).toBe(false);
  });

  it('remembers the user-chosen auth mode in localStorage', async () => {
    mockChatBridge({ installed: true });
    const { result, unmount } = renderHook(() => useClaude());
    await waitFor(() => expect(result.current.cliDetected).toBe(true));
    act(() => result.current.setAuthMode('api-key'));
    expect(localStorage.getItem('contexture-claude-auth-mode')).toBe('api-key');
    unmount();

    // Fresh hook picks up the stored mode even though the CLI is present.
    mockChatBridge({ installed: true });
    const { result: r2 } = renderHook(() => useClaude());
    await waitFor(() => expect(r2.current.authMode).toBe('api-key'));
  });

  it('is ready in api-key mode once a key is set', async () => {
    mockChatBridge({ installed: false });
    const { result } = renderHook(() => useClaude());
    await waitFor(() => expect(result.current.authMode).toBe('api-key'));
    expect(result.current.isReady).toBe(false);
    act(() => result.current.setApiKey('sk-ant-xyz'));
    expect(result.current.isReady).toBe(true);
    expect(localStorage.getItem('contexture-claude-api-key')).toBe('sk-ant-xyz');
  });

  it('pushes the initial auth snapshot to main on mount', async () => {
    const setAuth = vi.fn(async () => ({ ok: true }));
    mockChatBridge({ installed: true, setAuth });
    renderHook(() => useClaude());
    await waitFor(() => expect(setAuth).toHaveBeenCalled());
    // First call is the initial snapshot; mode derived from default (max).
    expect(setAuth).toHaveBeenCalledWith({ mode: 'max' });
  });

  it('pushes auth again whenever the mode or key changes', async () => {
    const setAuth = vi.fn(async () => ({ ok: true }));
    mockChatBridge({ installed: true, setAuth });
    const { result } = renderHook(() => useClaude());
    await waitFor(() => expect(result.current.cliDetected).toBe(true));
    act(() => result.current.setAuthMode('api-key'));
    act(() => result.current.setApiKey('sk-ant-new'));
    // Last call carries the latest mode+key pair.
    expect(setAuth).toHaveBeenLastCalledWith({ mode: 'api-key', key: 'sk-ant-new' });
  });
});
