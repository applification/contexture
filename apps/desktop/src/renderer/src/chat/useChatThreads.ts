/**
 * `useChatThreads` — localStorage-backed chat-thread store.
 *
 * Stores multiple conversations per schema file and lets the user switch
 * between them from the chat panel. Each `ChatThread` can carry a
 * provider-owned thread ref so switching resumes that thread's prior context.
 *
 * Storage is localStorage — the chat transcript is disposable by
 * design (see `plans/pivot.md` §sidecars) and shipping the full thread
 * collection in the git-tracked `.contexture/chat.json` would bloat
 * diffs. Threads are keyed by schema file path; untitled chats stay
 * ephemeral in the chat panel and are not restored from storage.
 *
 * Quota handling: on quota-exceeded we drop the oldest half and retry.
 * Silent failure is acceptable — losing transcripts never blocks
 * schema authoring.
 */

import type { ChatMessage } from '@contexture/core';
import { create } from 'zustand';

export type ProviderKind = 'codex' | 'claude';

export interface ChatThread {
  id: string;
  provider: ProviderKind;
  title: string;
  messages: ChatMessage[];
  model?: string;
  effort?: string;
  modelOptions?: Record<string, string | boolean>;
  filePath: string | null;
  providerThreadRef?: unknown;
  desynced?: boolean;
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
      if (t.provider === undefined) t.provider = 'claude';
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
  /**
   * Enter a document chat scope and select the right thread for it.
   * Untitled documents intentionally clear the active persisted thread.
   */
  enterDocumentScope: (filePath: string | null) => ChatThread | null;
  /** Create a file-backed thread. Untitled chats are intentionally excluded. */
  createFileThread: (input: {
    provider: ProviderKind;
    model?: string;
    effort?: string;
    modelOptions?: Record<string, string | boolean>;
    filePath: string;
    messages?: ChatMessage[];
  }) => ChatThread;
  /** Persist a transcript into the active file-backed thread, creating one if needed. */
  persistActiveTranscript: (input: {
    messages: ChatMessage[];
    provider: ProviderKind;
    model?: string;
    effort?: string;
    modelOptions?: Record<string, string | boolean>;
    filePath: string | null;
  }) => ChatThread | null;
  /** All threads for a given file, newest-first. */
  threadsForFile: (filePath: string | null) => ChatThread[];
  /** Switch active thread. Returns the newly-active thread for convenience. */
  switchThread: (id: string) => ChatThread | undefined;
  deleteThread: (id: string, filePath?: string | null) => ChatThread | null;
  updateThreadMessages: (id: string, messages: ChatMessage[]) => void;
  updateThreadSettings: (
    id: string,
    settings: {
      provider: ProviderKind;
      model?: string;
      effort?: string;
      modelOptions?: Record<string, string | boolean>;
    },
  ) => void;
  updateThreadProviderRef: (id: string, providerThreadRef: unknown) => void;
  markThreadDesynced: (id: string) => void;
  getActiveThread: () => ChatThread | undefined;
  reloadFromStorage: () => void;
}

export const useChatThreadStore = create<UseChatThreadsReturn>((set, get) => {
  function commitThreads(threads: ChatThread[]): void {
    set({ threads });
    saveThreads(threads);
  }

  function commitActiveThread(id: string | null): void {
    set({ activeThreadId: id });
    if (id) localStorage.setItem(ACTIVE_THREAD_KEY, id);
    else localStorage.removeItem(ACTIVE_THREAD_KEY);
  }

  function createThreadRecord(input: {
    provider: ProviderKind;
    model?: string;
    effort?: string;
    modelOptions?: Record<string, string | boolean>;
    filePath: string | null;
    messages?: ChatMessage[];
  }): ChatThread {
    const now = Date.now();
    const messages = input.messages ?? [];
    const firstUser = messages.find((m) => m.role === 'user');
    return {
      id: generateId(),
      provider: input.provider,
      title: firstUser ? titleFromMessage(firstUser.content) : 'New chat',
      messages,
      model: input.model,
      effort: input.effort,
      modelOptions: input.modelOptions,
      filePath: input.filePath,
      createdAt: now,
      updatedAt: now,
    };
  }

  function replaceThread(
    id: string,
    updater: (thread: ChatThread) => ChatThread,
  ): ChatThread | null {
    let updated: ChatThread | null = null;
    const threads = get().threads.map((thread) => {
      if (thread.id !== id) return thread;
      updated = updater(thread);
      return updated;
    });
    if (updated) commitThreads(threads);
    return updated;
  }

  return {
    threads: loadThreads(),
    activeThreadId: localStorage.getItem(ACTIVE_THREAD_KEY),
    showThreadList: false,

    setShowThreadList(show) {
      set({ showThreadList: show });
    },

    enterDocumentScope(filePath) {
      if (filePath === null) {
        commitActiveThread(null);
        return null;
      }

      const active = get().getActiveThread();
      if (active?.filePath === filePath) return active;

      const latest = get().threadsForFile(filePath)[0] ?? null;
      commitActiveThread(latest?.id ?? null);
      return latest;
    },

    createFileThread(input) {
      const thread = createThreadRecord(input);
      commitThreads([thread, ...get().threads].slice(0, MAX_THREADS));
      commitActiveThread(thread.id);
      return thread;
    },

    persistActiveTranscript(input) {
      if (input.filePath === null || input.messages.length === 0) return null;
      const active = get().getActiveThread();
      const thread =
        active?.filePath === input.filePath
          ? active
          : get().createFileThread({
              provider: input.provider,
              model: input.model,
              effort: input.effort,
              modelOptions: input.modelOptions,
              filePath: input.filePath,
            });

      get().updateThreadMessages(thread.id, input.messages);
      get().updateThreadSettings(thread.id, {
        provider: input.provider,
        model: input.model,
        effort: input.effort,
        modelOptions: input.modelOptions,
      });
      return get().threads.find((candidate) => candidate.id === thread.id) ?? thread;
    },

    threadsForFile(filePath) {
      return get()
        .threads.filter((t) => t.filePath === filePath)
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    switchThread(id) {
      const thread = get().threads.find((t) => t.id === id);
      if (!thread) return undefined;
      commitActiveThread(id);
      set({ showThreadList: false });
      return thread;
    },

    deleteThread(id, filePath) {
      const state = get();
      const remaining = state.threads.filter((t) => t.id !== id);
      commitThreads(remaining);
      if (state.activeThreadId !== id) return null;

      const next =
        filePath === undefined
          ? remaining[0]
          : remaining
              .filter((thread) => thread.filePath === filePath)
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      commitActiveThread(next?.id ?? null);
      return next ?? null;
    },

    updateThreadMessages(id, messages) {
      replaceThread(id, (thread) => {
        const firstUser = messages.find((m) => m.role === 'user');
        const title =
          thread.title === 'New chat' && firstUser
            ? titleFromMessage(firstUser.content)
            : thread.title;
        return { ...thread, messages, title, updatedAt: Date.now() };
      });
    },

    updateThreadSettings(id, settings) {
      replaceThread(id, (thread) => {
        if (
          thread.provider === settings.provider &&
          thread.model === settings.model &&
          thread.effort === settings.effort &&
          modelOptionsEqual(thread.modelOptions, settings.modelOptions)
        ) {
          return thread;
        }
        return { ...thread, ...settings, updatedAt: Date.now() };
      });
    },

    updateThreadProviderRef(id, providerThreadRef) {
      replaceThread(id, (thread) =>
        thread.providerThreadRef !== providerThreadRef
          ? { ...thread, providerThreadRef, updatedAt: Date.now() }
          : thread,
      );
    },

    markThreadDesynced(id) {
      replaceThread(id, (thread) => (!thread.desynced ? { ...thread, desynced: true } : thread));
    },

    getActiveThread() {
      const activeThreadId = get().activeThreadId;
      return get().threads.find((t) => t.id === activeThreadId);
    },

    reloadFromStorage() {
      set({
        threads: loadThreads(),
        activeThreadId: localStorage.getItem(ACTIVE_THREAD_KEY),
        showThreadList: false,
      });
    },
  };
});

export function useChatThreads(): UseChatThreadsReturn {
  return useChatThreadStore();
}

function modelOptionsEqual(
  left: Record<string, string | boolean> | undefined,
  right: Record<string, string | boolean> | undefined,
): boolean {
  if (left === right) return true;
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value]) => right?.[key] === value);
}
