import type { ElectronAPI } from '@electron-toolkit/preload';

type Unsubscribe = () => void;

export interface ContextureChatAPI {
  send: (message: string) => Promise<{ ok: boolean; error?: string }>;
  setIR: (ir: unknown) => void;
  onAssistant: (listener: (payload: { text: string }) => void) => Unsubscribe;
  onToolUse: (listener: (payload: { name: string; input: unknown }) => void) => Unsubscribe;
  onResult: (listener: (payload: { ok: boolean; error?: string }) => void) => Unsubscribe;
  onError: (listener: (payload: { message: string }) => void) => Unsubscribe;
  onTurnBegin: (listener: () => void) => Unsubscribe;
  onTurnCommit: (listener: () => void) => Unsubscribe;
  onTurnRollback: (listener: () => void) => Unsubscribe;
  replyOp: (id: string, result: unknown) => void;
  onOpRequest: (listener: (payload: { id: string; op: unknown }) => void) => Unsubscribe;
}

export interface ContextureAPI {
  chat: ContextureChatAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    contexture: ContextureAPI;
  }
}
