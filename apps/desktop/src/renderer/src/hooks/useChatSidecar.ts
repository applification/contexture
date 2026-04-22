/**
 * `useChatSidecar` — load and persist chat transcript into the
 * `<name>.contexture.chat.json` sidecar.
 *
 * Read path: on mount (or when `filePath` changes), read the sidecar
 * and hand the messages back through `onHydrate`. Invalid / missing
 * sidecars come back with the default empty history and no error; the
 * chat transcript is disposable by design.
 *
 * Write path: `appendMessage` serialises the full current history and
 * writes the sidecar. Callers stream new messages in via this method
 * rather than bulk rewrites so the sidecar stays up to date during a
 * streaming response.
 *
 * The disable-persistence toggle lives in the UI store
 * (`chatHistoryPersistence`) and is the caller's concern — this hook
 * writes unconditionally; `useClaudeSchemaChat` decides whether to
 * call `appendMessage`.
 */
import { useCallback, useEffect } from 'react';
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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!filePath) return;
      const raw = await window.api.readFileSilent(sidecarPath(filePath));
      if (cancelled) return;
      if (!raw) {
        onHydrate?.(DEFAULT_CHAT_HISTORY.messages);
        return;
      }
      const { history } = loadChatHistory(raw);
      onHydrate?.(history.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath, onHydrate]);

  const appendMessage = useCallback(
    async (_message: ChatMessage): Promise<void> => {
      if (!filePath) return;
      const history: ChatHistory = {
        version: CHAT_HISTORY_VERSION,
        messages: getMessages(),
      };
      await window.api.saveFile(sidecarPath(filePath), saveChatHistory(history));
    },
    [filePath, getMessages],
  );

  return { appendMessage };
}
