/**
 * `useClaude` — chat-session settings that live on the renderer side.
 *
 * Owns the user-facing knobs the pre-pivot app surfaced in the toolbar
 * popover + prompt input: auth mode, api key, selected model, and
 * thinking-effort. Each knob is persisted to localStorage and pushed
 * to main (`window.contexture.chat.setAuth` / `setModelOptions`) so the
 * next SDK `query()` call reads the latest state.
 *
 * Unlike the pre-pivot `useClaude`, this hook doesn't own messages or
 * tool callbacks — those live in `useClaudeSchemaChat`, driven by the
 * Agent SDK turn pipeline.
 */
import { useCallback, useEffect, useState } from 'react';

export type AuthMode = 'max' | 'api-key';
export type ModelId = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6';
export type ThinkingBudget = 'auto' | 'low' | 'med' | 'high';

interface UseClaudeReturn {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  cliDetected: boolean;
  isReady: boolean;
  model: ModelId;
  setModel: (model: ModelId) => void;
  thinkingBudget: ThinkingBudget;
  setThinkingBudget: (budget: ThinkingBudget) => void;
}

const API_KEY_STORAGE = 'contexture-claude-api-key';
const AUTH_MODE_STORAGE = 'contexture-claude-auth-mode';
const MODEL_STORAGE = 'contexture-claude-model';
const THINKING_STORAGE = 'contexture-claude-thinking-budget';

type AuthPayload = { mode: 'max' } | { mode: 'api-key'; key: string };

function pushAuth(auth: AuthPayload): void {
  if (typeof window === 'undefined' || !window.contexture?.chat?.setAuth) return;
  window.contexture.chat.setAuth(auth).catch(() => undefined);
}

function pushModelOptions(model: ModelId, thinkingBudget: ThinkingBudget): void {
  if (typeof window === 'undefined' || !window.contexture?.chat?.setModelOptions) return;
  window.contexture.chat.setModelOptions({ model, thinkingBudget }).catch(() => undefined);
}

export function useClaude(): UseClaudeReturn {
  const [authMode, setAuthModeState] = useState<AuthMode>(
    () => (localStorage.getItem(AUTH_MODE_STORAGE) as AuthMode | null) ?? 'max',
  );
  const [apiKey, setApiKeyState] = useState<string>(
    () => localStorage.getItem(API_KEY_STORAGE) ?? '',
  );
  const [cliDetected, setCliDetected] = useState<boolean>(false);
  const [model, setModelState] = useState<ModelId>(
    () => (localStorage.getItem(MODEL_STORAGE) as ModelId | null) ?? 'claude-sonnet-4-6',
  );
  const [thinkingBudget, setThinkingBudgetState] = useState<ThinkingBudget>(
    () => (localStorage.getItem(THINKING_STORAGE) as ThinkingBudget | null) ?? 'auto',
  );

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

  // Push the initial auth + model snapshot to main so the first turn
  // uses it without requiring the user to open the popover first.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot initial sync
  useEffect(() => {
    if (authMode === 'max') pushAuth({ mode: 'max' });
    else pushAuth({ mode: 'api-key', key: apiKey });
    pushModelOptions(model, thinkingBudget);
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

  const setModel = useCallback(
    (next: ModelId) => {
      setModelState(next);
      localStorage.setItem(MODEL_STORAGE, next);
      pushModelOptions(next, thinkingBudget);
    },
    [thinkingBudget],
  );

  const setThinkingBudget = useCallback(
    (next: ThinkingBudget) => {
      setThinkingBudgetState(next);
      localStorage.setItem(THINKING_STORAGE, next);
      pushModelOptions(model, next);
    },
    [model],
  );

  const isReady = authMode === 'max' ? cliDetected : apiKey.length > 0;

  return {
    authMode,
    setAuthMode,
    apiKey,
    setApiKey,
    cliDetected,
    isReady,
    model,
    setModel,
    thinkingBudget,
    setThinkingBudget,
  };
}
