import type { ChatHistory, ChatMessage } from '@contexture/core';
import { create } from 'zustand';

export interface SchemaAgentSessionState {
  messages: ChatMessage[];
  isStreaming: boolean;
  liveAssistant: string;
  authRequired: boolean;
  isReady: boolean;
  unavailableMessage: string | null;
  providerThreadRef: unknown;
  desynced: boolean;

  reset: () => void;
  setReadiness: (ready: boolean, message: string | null) => void;
  setUnavailableMessage: (message: string | null) => void;
  appendMessage: (message: ChatMessage) => void;
  hydrateHistoryState: (history: ChatHistory) => void;
  beginTurn: (message: ChatMessage) => void;
  finishAssistant: (message: ChatMessage | null) => void;
  failTurn: (message: ChatMessage, authRequired: boolean) => void;
  setLiveAssistant: (text: string) => void;
  clearLiveAssistant: () => void;
  clearTranscript: () => void;
  setProviderThread: (thread: unknown, desynced: boolean) => void;
  clearAuthRequired: () => void;
}

const initialState = {
  messages: [],
  isStreaming: false,
  liveAssistant: '',
  authRequired: false,
  isReady: false,
  unavailableMessage: null,
  providerThreadRef: undefined,
  desynced: false,
};

export const useSchemaAgentSessionStore = create<SchemaAgentSessionState>((set) => ({
  ...initialState,

  reset() {
    set(initialState);
  },

  setReadiness(isReady, unavailableMessage) {
    set({ isReady, unavailableMessage });
  },

  setUnavailableMessage(unavailableMessage) {
    set({ unavailableMessage });
  },

  appendMessage(message) {
    set((state) => ({ messages: [...state.messages, message] }));
  },

  hydrateHistoryState(history) {
    set({
      messages: history.messages,
      providerThreadRef: history.providerThreadRef,
      desynced: false,
      isStreaming: false,
      liveAssistant: '',
      authRequired: false,
    });
  },

  beginTurn(message) {
    set((state) => ({
      messages: [...state.messages, message],
      isStreaming: true,
      liveAssistant: '',
      authRequired: false,
    }));
  },

  finishAssistant(message) {
    set((state) => ({
      messages: message ? [...state.messages, message] : state.messages,
      isStreaming: false,
      liveAssistant: '',
    }));
  },

  failTurn(message, authRequired) {
    set((state) => ({
      messages: [...state.messages, message],
      isStreaming: false,
      liveAssistant: '',
      authRequired,
    }));
  },

  setLiveAssistant(liveAssistant) {
    set({ liveAssistant });
  },

  clearLiveAssistant() {
    set({ liveAssistant: '' });
  },

  clearTranscript() {
    set({
      messages: [],
      liveAssistant: '',
      isStreaming: false,
      providerThreadRef: undefined,
      desynced: false,
    });
  },

  setProviderThread(providerThreadRef, desynced) {
    set({ providerThreadRef, desynced });
  },

  clearAuthRequired() {
    set({ authRequired: false });
  },
}));
