/**
 * `useChatSidecar` — load and persist chat transcript into the
 * `<name>.contexture.chat.json` sidecar.
 *
 * Read path: on mount (or when `filePath` changes), read the sidecar
 * and hand the messages back through `onHydrate`. If a `sessionId` is
 * present in the sidecar, restore it into the main-process chat driver
 * via `contexture.chat.setSessionId` so follow-up turns resume the
 * prior SDK session. When the file path changes to a different schema,
 * clear the main-side session first so we never leak session ids
 * across projects. Invalid / missing sidecars come back with the
 * default empty history and no error; the chat transcript is
 * disposable by design.
 *
 * Write path: `appendMessage` serialises the full current history and
 * writes the sidecar. The hook also subscribes to `onSession` events
 * from main — on every sighting it updates the in-memory sessionId and
 * re-writes the sidecar so follow-up app sessions can resume.
 *
 * The disable-persistence toggle lives in the UI store
 * (`chatHistoryPersistence`) and is the caller's concern — this hook
 * writes unconditionally; `useClaudeSchemaChat` decides whether to
 * call `appendMessage`.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  CHAT_HISTORY_VERSION,
  type ChatHistory,
  type ChatMessage,
  DEFAULT_CHAT_HISTORY,
  loadChatHistory,
  saveChatHistory,
} from '../model/chat-history';

const SIDECAR_SUFFIX = '.chat.json';

function sidecarPath(filePath: string): string {
  return `${filePath}${SIDECAR_SUFFIX}`;
}

export interface UseChatSidecarArgs {
  filePath: string | null;
  onHydrate?: (messages: ChatMessage[]) => void;
  /** Current in-memory history; the hook serialises this on each append. */
  getMessages: () => ChatMessage[];
}

export function useChatSidecar({ filePath, onHydrate, getMessages }: UseChatSidecarArgs) {
  // Track the last-seen sessionId for the current file so we can
  // re-serialise it alongside messages on every write. Ref (not state)
  // to keep writes synchronous and avoid extra renders.
  const sessionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // On file change, always drop the previous session id so a stale
    // one can't leak into the next schema's conversation.
    sessionIdRef.current = undefined;
    void window.contexture.chat.clearSession();
    (async () => {
      if (!filePath) return;
      const raw = await window.api.readFileSilent(sidecarPath(filePath));
      if (cancelled) return;
      if (!raw) {
        onHydrate?.(DEFAULT_CHAT_HISTORY.messages);
        return;
      }
      const { history } = loadChatHistory(raw);
      if (history.sessionId) {
        sessionIdRef.current = history.sessionId;
        await window.contexture.chat.setSessionId(history.sessionId);
      }
      onHydrate?.(history.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath, onHydrate]);

  // Subscribe to session id updates from main: every SDK turn emits
  // the current sessionId; persist it so a future app-restart resumes
  // the same conversation.
  useEffect(() => {
    const unsubscribe = window.contexture.chat.onSession(({ sessionId }) => {
      if (!sessionId || sessionId === sessionIdRef.current) return;
      sessionIdRef.current = sessionId;
      if (!filePath) return;
      // Fire-and-forget: persistence failures don't block chat flow.
      const history: ChatHistory = {
        version: CHAT_HISTORY_VERSION,
        messages: getMessages(),
        sessionId,
      };
      void window.api.saveFile(sidecarPath(filePath), saveChatHistory(history));
    });
    return unsubscribe;
  }, [filePath, getMessages]);

  const appendMessage = useCallback(
    async (_message: ChatMessage): Promise<void> => {
      if (!filePath) return;
      const history: ChatHistory = {
        version: CHAT_HISTORY_VERSION,
        messages: getMessages(),
        ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
      };
      await window.api.saveFile(sidecarPath(filePath), saveChatHistory(history));
    },
    [filePath, getMessages],
  );

  return { appendMessage };
}
