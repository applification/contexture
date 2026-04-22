/**
 * `useClaude` — auth + readiness state for the chat session.
 *
 * Unlike the pre-pivot `useClaude`, this hook doesn't own messages or
 * tool callbacks — those live in `useClaudeSchemaChat` now, driven by
 * the Agent SDK turn pipeline. This hook just tracks:
 *
 *   - **auth mode** (`max` = Claude CLI / OAuth; `api-key` = raw key)
 *   - **api key** (only relevant for `api-key` mode; persisted to
 *     localStorage so the user doesn't re-enter on every launch)
 *   - **cliDetected** (is `claude` on PATH?)
 *   - **isReady** (true when the current mode has enough to run a
 *     turn — CLI installed for `max`, non-empty key for `api-key`)
 *
 * Every setter also pushes the current auth to main via
 * `window.contexture.chat.setAuth` so the next SDK query picks it up.
 */
import { useCallback, useEffect, useState } from 'react';

export type AuthMode = 'max' | 'api-key';

interface UseClaudeReturn {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  cliDetected: boolean;
  isReady: boolean;
}

const API_KEY_STORAGE = 'contexture-claude-api-key';
const AUTH_MODE_STORAGE = 'contexture-claude-auth-mode';

function pushAuth(auth: { mode: 'max' } | { mode: 'api-key'; key: string }): void {
  if (typeof window === 'undefined' || !window.contexture?.chat?.setAuth) return;
  window.contexture.chat.setAuth(auth).catch(() => undefined);
}

export function useClaude(): UseClaudeReturn {
  const [authMode, setAuthModeState] = useState<AuthMode>(
    () => (localStorage.getItem(AUTH_MODE_STORAGE) as AuthMode | null) ?? 'max',
  );
  const [apiKey, setApiKeyState] = useState<string>(
    () => localStorage.getItem(API_KEY_STORAGE) ?? '',
  );
  const [cliDetected, setCliDetected] = useState<boolean>(false);

  // One-shot CLI probe on mount; also picks a sensible default auth
  // mode the first time the user opens the app (CLI found → Max;
  // otherwise api-key).
  useEffect(() => {
    if (!window.contexture?.chat?.detectClaudeCli) return;
    window.contexture.chat
      .detectClaudeCli()
      .then((result) => {
        setCliDetected(result.installed);
        if (!localStorage.getItem(AUTH_MODE_STORAGE)) {
          const next: AuthMode = result.installed ? 'max' : 'api-key';
          setAuthModeState(next);
        }
      })
      .catch(() => undefined);
  }, []);

  // Push the initial auth snapshot to main so the first turn uses it
  // without requiring the user to open the popover first. Subsequent
  // updates flow through the setters below, so a one-shot mount effect
  // is what we want — extra re-syncs would race the setters.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot initial sync
  useEffect(() => {
    if (authMode === 'max') pushAuth({ mode: 'max' });
    else pushAuth({ mode: 'api-key', key: apiKey });
  }, []);

  const setAuthMode = useCallback(
    (mode: AuthMode) => {
      setAuthModeState(mode);
      localStorage.setItem(AUTH_MODE_STORAGE, mode);
      if (mode === 'max') pushAuth({ mode: 'max' });
      else pushAuth({ mode: 'api-key', key: apiKey });
    },
    [apiKey],
  );

  const setApiKey = useCallback(
    (key: string) => {
      setApiKeyState(key);
      if (key) localStorage.setItem(API_KEY_STORAGE, key);
      else localStorage.removeItem(API_KEY_STORAGE);
      if (authMode === 'api-key') pushAuth({ mode: 'api-key', key });
    },
    [authMode],
  );

  const isReady = authMode === 'max' ? cliDetected : apiKey.length > 0;

  return { authMode, setAuthMode, apiKey, setApiKey, cliDetected, isReady };
}
