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
  pickDirectory: () => Promise<string | null>;
  /** Pick a .contexture.json scratch file; returns the absolute path or null if cancelled. */
  pickContextureFile: () => Promise<string | null>;
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

export type ScaffoldPreflightError =
  | { kind: 'missing-bun' }
  | { kind: 'missing-git' }
  | { kind: 'missing-node' }
  | { kind: 'no-network' }
  | { kind: 'parent-not-writable'; path: string }
  | { kind: 'target-exists'; path: string }
  | { kind: 'insufficient-space'; bytesFree: number }
  | { kind: 'scratch-unreadable' }
  | { kind: 'scratch-invalid-ir' };

export type ScaffoldEvent =
  | { kind: 'preflight-failed'; error: ScaffoldPreflightError }
  | { kind: 'stage-start'; stage: number }
  | { kind: 'stdout-chunk'; stage: number; chunk: string }
  | { kind: 'stderr-chunk'; stage: number; chunk: string }
  | { kind: 'stage-done'; stage: number }
  | { kind: 'stage-failed'; stage: number; stderr: string; retrySafe: boolean }
  | { kind: 'scaffold-done' };

export type AppKind = 'web' | 'mobile' | 'desktop';

export interface ContextureScaffoldAPI {
  start: (config: {
    targetDir: string;
    projectName: string;
    apps: AppKind[];
    description?: string;
    scratchPath?: string;
  }) => Promise<void>;
  onEvent: (listener: (event: ScaffoldEvent) => void) => Unsubscribe;
}

export interface ContextureShellAPI {
  /** Reveal the given path in the OS file manager (Finder / Explorer). */
  reveal: (path: string) => Promise<void>;
  /** Open a folder or file in VS Code via the `vscode://` URL scheme. */
  openInEditor: (path: string) => Promise<void>;
}

export interface ContextureProjectAPI {
  /** Recursively delete a directory — used by the "delete and start over" flow. */
  deleteDirectory: (path: string) => Promise<void>;
}

export interface ContextureDriftAPI {
  /** Start watching all manifest files for drift against emitted.json. */
  watch: (payload: { emittedJsonPath: string }) => Promise<{ ok: boolean }>;
  /** Stop the active watcher. */
  unwatch: () => Promise<{ ok: boolean }>;
  /** Trigger a manual hash check (window focus). */
  check: () => Promise<{ ok: boolean }>;
  /** Reset the main-side drifted flag after user dismisses the banner. */
  dismiss: () => Promise<{ ok: boolean }>;
  onDetected: (listener: (payload: { paths: string[] }) => void) => Unsubscribe;
  onResolved: (listener: () => void) => Unsubscribe;
}

export interface ContextureReconcileAPI {
  /**
   * Fire a one-shot Claude query that proposes IR ops to align the
   * current schema with the user's hand-edited on-disk source. The
   * returned `ops` array is raw — the renderer validates each entry
   * via the op-applier before showing it in the modal.
   */
  query: (payload: {
    irJson: string;
    onDiskSource: string;
    targetKind: string;
  }) => Promise<{ ok: boolean; ops?: unknown[]; error?: string }>;
}

export interface ContextureAPI {
  chat: ContextureChatAPI;
  file: ContextureFileAPI;
  scaffold: ContextureScaffoldAPI;
  shell: ContextureShellAPI;
  project: ContextureProjectAPI;
  drift: ContextureDriftAPI;
  reconcile: ContextureReconcileAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    contexture: ContextureAPI;
    api: LegacyAPI;
  }
}
