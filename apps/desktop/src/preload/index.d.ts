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
  setModelOptions: (opts: {
    model?: string;
    thinkingBudget?: 'auto' | 'low' | 'med' | 'high';
  }) => Promise<{ ok: boolean }>;
  abort: () => Promise<{ ok: boolean; error?: string }>;
  onAssistant: (listener: (payload: { text: string }) => void) => Unsubscribe;
  onToolUse: (listener: (payload: { name: string; input: unknown }) => void) => Unsubscribe;
  onResult: (listener: (payload: { ok: boolean; error?: string }) => void) => Unsubscribe;
  onError: (listener: (payload: { message: string }) => void) => Unsubscribe;
  /** Auth failure subscription — renderer surfaces re-auth CTA. */
  onAuthRequired: (listener: (payload: { message: string }) => void) => Unsubscribe;
  onTurnBegin: (listener: () => void) => Unsubscribe;
  onTurnCommit: (listener: () => void) => Unsubscribe;
  onTurnRollback: (listener: () => void) => Unsubscribe;
  replyOp: (id: string, result: unknown) => void;
  onOpRequest: (listener: (payload: { id: string; op: unknown }) => void) => Unsubscribe;
  onSession: (listener: (payload: { sessionId: string }) => void) => Unsubscribe;
  setSessionId: (sessionId: string) => Promise<{ ok: boolean }>;
  clearSession: () => Promise<{ ok: boolean }>;
}

export interface OpenWarning {
  message: string;
  severity: 'warning' | 'error';
}

export interface OpenedDocument {
  irPath: string;
  /** `scratch` = bare IR on disk; `project` = `.contexture/` sidecar present. */
  mode: 'scratch' | 'project';
  /** Raw IR text — parsed by the renderer's `load()` for error surfacing. */
  content: string;
  /** Pre-parsed layout sidecar (defaults if missing/corrupt). */
  layout: { version: '1'; positions: Record<string, { x: number; y: number }> } & Record<
    string,
    unknown
  >;
  /** Pre-parsed chat sidecar (defaults if missing/corrupt). */
  chat: {
    version: '1';
    messages: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      createdAt: number;
    }>;
    sessionId?: string;
  };
  /** Sidecar warnings (not IR — those come from renderer-side `load()`). */
  warnings: OpenWarning[];
}

export interface ContextureFileAPI {
  openDialog: () => Promise<OpenedDocument | null>;
  saveAsDialog: () => Promise<string | null>;
  save: (payload: {
    irPath: string;
    schema: unknown;
    layout: unknown;
    chat: unknown;
  }) => Promise<void>;
  read: (irPath: string) => Promise<OpenedDocument | null>;
  getRecentFiles: () => Promise<string[]>;
  openRecent: (filePath: string) => Promise<OpenedDocument | null>;
  onMenuNew: (listener: () => void) => Unsubscribe;
  onMenuNewProject: (listener: () => void) => Unsubscribe;
  onMenuOpen: (listener: () => void) => Unsubscribe;
  onMenuSave: (listener: () => void) => Unsubscribe;
  onMenuSaveAs: (listener: () => void) => Unsubscribe;
}

export interface ContextureAPI {
  chat: ContextureChatAPI;
  file: ContextureFileAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    contexture: ContextureAPI;
    api: LegacyAPI;
  }
}
