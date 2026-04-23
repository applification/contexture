/**
 * Chat composer store.
 *
 * Owns the in-flight chat draft text, a pending-message relay (used by
 * the "ask about selection" flow to push a pre-filled message into the
 * composer), and the user's preference for persisting chat history to
 * the sidecar.
 */
import { create } from 'zustand';

export interface PendingChatMessage {
  message: string;
  context: string;
}

interface ChatComposerStoreShape {
  chatDraft: string;
  pendingChatMessage: PendingChatMessage | null;
  chatHistoryPersistence: boolean;

  setChatDraft(draft: string): void;
  setPendingChatMessage(msg: PendingChatMessage | null): void;
  setChatHistoryPersistence(enabled: boolean): void;
}

export const useChatComposerStore = create<ChatComposerStoreShape>((set) => ({
  chatDraft: '',
  pendingChatMessage: null,
  chatHistoryPersistence: true,

  setChatDraft: (draft) => set({ chatDraft: draft }),
  setPendingChatMessage: (msg) => set({ pendingChatMessage: msg }),
  setChatHistoryPersistence: (enabled) => set({ chatHistoryPersistence: enabled }),
}));
