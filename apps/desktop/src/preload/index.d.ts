import type { ElectronAPI } from '@electron-toolkit/preload';

type Unsubscribe = () => void;

/**
 * Legacy `window.api` surface — carried over from the pre-pivot app so
 * hooks like `useLayoutSidecar`, `useChatSidecar`, and `UpdateBanner`
 * typecheck. The methods are wired to real IPC where implemented and
 * stubbed out in the test setup file (`tests/setup.ts`). New renderer
 * code should reach for `window.contexture.*` instead.
 */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version?: string }
  | { status: 'downloading'; version?: string; progress?: number }
  | { status: 'ready'; version?: string }
  | { status: 'error'; message?: string };

export interface LegacyAPI {
  readFileSilent: (path: string) => Promise<string | null>;
  saveFile: (path: string, contents: string) => Promise<unknown>;
  openFile?: () => Promise<unknown>;
  saveFileAs?: () => Promise<unknown>;
  onMenuFileOpen?: (listener: (path: string) => void) => Unsubscribe;
  onMenuFileSave?: (listener: () => void) => Unsubscribe;
  onMenuFileSaveAs?: (listener: () => void) => Unsubscribe;

  // Auto-update
  getUpdateState: () => Promise<UpdateState>;
  onUpdateState: (listener: (state: UpdateState) => void) => Unsubscribe;
  checkForUpdate: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  installUpdate: () => void;
  openReleasesPage: () => void;

  // Legacy Claude assistant subscription (ImprovementHUD)
  onClaudeAssistantText: (listener: (text: string) => void) => Unsubscribe;
  onClaudeResult: (listener: (result?: unknown) => void) => Unsubscribe;
  onClaudeError: (listener: (err?: unknown) => void) => Unsubscribe;
}

export interface ContextureChatAPI {
  send: (message: string) => Promise<{ ok: boolean; error?: string }>;
  setIR: (ir: unknown) => void;
  detectClaudeCli: () => Promise<{ installed: boolean; path: string | null }>;
  setAuth: (
    auth: { mode: 'max' } | { mode: 'api-key'; key: string },
  ) => Promise<{ ok: boolean; error?: string }>;
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
    api: LegacyAPI;
  }
}
