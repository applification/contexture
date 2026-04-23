/**
 * `useChatThreads` — localStorage-backed chat-thread store.
 *
 * Mirrors the pre-pivot (`main` branch) UX where the user can keep
 * multiple conversations per schema file and switch between them from
 * a list in the chat panel. Each `ChatThread` carries its own Agent
 * SDK `sessionId` so switching resumes that thread's prior context.
 *
 * Storage is localStorage — the chat transcript is disposable by
 * design (see `plans/pivot.md` §sidecars) and shipping the full thread
 * collection in the git-tracked `.contexture.chat.json` would bloat
 * diffs. Threads are keyed by schema file path; "no file yet" threads
 * live under a `null` filePath bucket.
 *
 * Quota handling: on quota-exceeded we drop the oldest half and retry.
 * Silent failure is acceptable — losing transcripts never blocks
 * schema authoring.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage } from '../model/chat-history';

export type ModelId = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6';

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: ModelId;
  filePath: string | null;
  /** Agent SDK session id — set after the first turn. Undefined on a fresh thread. */
  sessionId?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'contexture-chat-threads';
const ACTIVE_THREAD_KEY = 'contexture-active-thread';
const MAX_THREADS = 50;

function generateId(): string {
  return crypto.randomUUID();
}

function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const threads: ChatThread[] = raw ? JSON.parse(raw) : [];
    // Defensive: older stored threads may be missing optional fields.
    for (const t of threads) {
      if (t.filePath === undefined) t.filePath = null;
      if (!Array.isArray(t.messages)) t.messages = [];
    }
    return threads;
  } catch {
    return [];
  }
}

function saveThreads(threads: ChatThread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // Quota exceeded — prune oldest half and retry once.
    try {
      const pruned = threads.slice(0, Math.ceil(threads.length / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      // Storage totally full — silently skip.
    }
  }
}

function titleFromMessage(message: string): string {
  const clean = message.trim();
  return clean.length > 50 ? `${clean.slice(0, 50)}…` : clean || 'New chat';
}

export interface UseChatThreadsReturn {
  threads: ChatThread[];
  activeThreadId: string | null;
  showThreadList: boolean;
  setShowThreadList: (show: boolean) => void;
  /** Create a new thread; returns the id. Sets it as active. */
  createThread: (model: ModelId, filePath: string | null) => string;
  /** All threads for a given file, newest-first. */
  threadsForFile: (filePath: string | null) => ChatThread[];
  /** Switch active thread. Returns the newly-active thread for convenience. */
  switchThread: (id: string) => ChatThread | undefined;
  deleteThread: (id: string) => void;
  updateThreadMessages: (id: string, messages: ChatMessage[]) => void;
  updateThreadSessionId: (id: string, sessionId: string) => void;
  getActiveThread: () => ChatThread | undefined;
  setActiveThreadId: (id: string | null) => void;
}

export function useChatThreads(): UseChatThreadsReturn {
  const [threads, setThreads] = useState<ChatThread[]>(loadThreads);
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_THREAD_KEY),
  );
  const [showThreadList, setShowThreadList] = useState(false);

  useEffect(() => {
    saveThreads(threads);
  }, [threads]);

  const setActiveThreadId = useCallback((id: string | null) => {
    setActiveThreadIdState(id);
    if (id) localStorage.setItem(ACTIVE_THREAD_KEY, id);
    else localStorage.removeItem(ACTIVE_THREAD_KEY);
  }, []);

  const createThread = useCallback(
    (model: ModelId, filePath: string | null): string => {
      const id = generateId();
      const thread: ChatThread = {
        id,
        title: 'New chat',
        messages: [],
        model,
        filePath,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setThreads((prev) => [thread, ...prev].slice(0, MAX_THREADS));
      setActiveThreadId(id);
      return id;
    },
    [setActiveThreadId],
  );

  const switchThread = useCallback(
    (id: string): ChatThread | undefined => {
      setActiveThreadId(id);
      setShowThreadList(false);
      return threads.find((t) => t.id === id);
    },
    [threads, setActiveThreadId],
  );

  const deleteThread = useCallback(
    (id: string) => {
      setThreads((prev) => {
        const remaining = prev.filter((t) => t.id !== id);
        if (activeThreadId === id) {
          setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
    },
    [activeThreadId, setActiveThreadId],
  );

  const updateThreadMessages = useCallback((id: string, messages: ChatMessage[]) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        // First real user message seeds the title so the thread list
        // picks up something meaningful.
        const firstUser = messages.find((m) => m.role === 'user');
        const title =
          t.title === 'New chat' && firstUser ? titleFromMessage(firstUser.content) : t.title;
        return { ...t, messages, title, updatedAt: Date.now() };
      }),
    );
  }, []);

  const updateThreadSessionId = useCallback((id: string, sessionId: string) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id && t.sessionId !== sessionId ? { ...t, sessionId, updatedAt: Date.now() } : t,
      ),
    );
  }, []);

  const getActiveThread = useCallback(
    (): ChatThread | undefined => threads.find((t) => t.id === activeThreadId),
    [threads, activeThreadId],
  );

  const threadsForFile = useCallback(
    (filePath: string | null): ChatThread[] =>
      threads
        .filter((t) => t.filePath === filePath)
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [threads],
  );

  return {
    threads,
    activeThreadId,
    showThreadList,
    setShowThreadList,
    createThread,
    switchThread,
    deleteThread,
    updateThreadMessages,
    updateThreadSessionId,
    getActiveThread,
    setActiveThreadId,
    threadsForFile,
  };
}
