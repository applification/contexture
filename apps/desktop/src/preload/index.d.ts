type Unsubscribe = () => void;

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version?: string }
  | { status: 'downloading'; version?: string; progress?: number }
  | { status: 'ready'; version?: string }
  | { status: 'error'; message?: string };

export interface ContextureSchemaAgentAPI {
  send: (message: string) => Promise<{ ok: boolean; error?: string }>;
  setIR: (ir: unknown) => void;
  abort: () => Promise<{ ok: boolean; error?: string }>;
  getStatus: () => Promise<unknown>;
  listModels: (provider?: 'codex' | 'claude') => Promise<unknown>;
  setProvider: (provider: 'codex' | 'claude') => Promise<{ ok: boolean; error?: string }>;
  setModelOptions: (options: {
    model?: string;
    effort?: string;
    options?: Record<string, string | boolean>;
  }) => Promise<{ ok: boolean }>;
  startLogin: (input: {
    mode: 'chatgpt' | 'api-key' | 'cli-session';
    apiKey?: string;
  }) => Promise<{ id: string; mode: 'chatgpt' | 'api-key' | 'cli-session'; url?: string }>;
  cancelLogin: (input: { flowId: string }) => Promise<void>;
  logout: () => Promise<void>;
  threadSet: (thread: unknown) => Promise<{ ok: boolean }>;
  threadClear: () => Promise<{ ok: boolean }>;
  replyTool: (id: string, result: unknown) => void;
  onAssistantDelta: (listener: (payload: { text: string }) => void) => Unsubscribe;
  onAssistantFinal: (listener: (payload: { text: string }) => void) => Unsubscribe;
  onToolCallStarted: (
    listener: (payload: { id: string; name: string; input?: unknown }) => void,
  ) => Unsubscribe;
  onToolCallFinished: (
    listener: (payload: { id: string; name: string; ok: boolean; result?: unknown }) => void,
  ) => Unsubscribe;
  onError: (listener: (payload: { message: string }) => void) => Unsubscribe;
  onStatusChanged: (listener: (payload: unknown) => void) => Unsubscribe;
  onThreadUpdated: (listener: (payload: { thread: unknown }) => void) => Unsubscribe;
  onThreadDesynced: (
    listener: (payload: { thread: unknown; reason: string }) => void,
  ) => Unsubscribe;
  onToolRequest: (listener: (payload: { id: string; op: unknown }) => void) => Unsubscribe;
  onTurnBegin: (listener: () => void) => Unsubscribe;
  onTurnCommit: (listener: () => void) => Unsubscribe;
  onTurnRollback: (listener: () => void) => Unsubscribe;
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
    provider?: 'codex' | 'claude';
    providerThreadRef?: unknown;
    model?: string;
    effort?: string;
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
  onDetected: (listener: (payload: DriftDetectedPayload) => void) => Unsubscribe;
  onResolved: (listener: () => void) => Unsubscribe;
}

export interface DriftDetectedPayload {
  paths: string[];
  files?: Array<{ path: string; status: 'drifted' | 'unreadable' }>;
}

export interface ContextureReconcileAPI {
  readGeneratedTarget: (payload: { irPath: string; targetPath: string }) => Promise<string | null>;
  writeGeneratedTarget: (payload: {
    irPath: string;
    targetPath: string;
    contents: string;
  }) => Promise<void>;
  /**
   * Fire a one-shot schema-agent query that proposes IR ops to align
   * the current schema with the user's hand-edited on-disk source. The
   * returned `ops` array is raw — the renderer validates each entry
   * via the op-applier before showing it in the modal.
   */
  query: (payload: {
    irJson: string;
    onDiskSource: string;
    targetKind: string;
  }) => Promise<{ ok: boolean; ops?: unknown[]; error?: string }>;
}

export interface ContextureUpdateAPI {
  getState: () => Promise<UpdateState>;
  onState: (listener: (state: UpdateState) => void) => Unsubscribe;
  check: () => Promise<unknown>;
  download: () => Promise<unknown>;
  install: () => void;
  openReleasesPage: () => void;
}

export interface ContextureAPI {
  schemaAgent: ContextureSchemaAgentAPI;
  file: ContextureFileAPI;
  scaffold: ContextureScaffoldAPI;
  shell: ContextureShellAPI;
  project: ContextureProjectAPI;
  drift: ContextureDriftAPI;
  reconcile: ContextureReconcileAPI;
  update: ContextureUpdateAPI;
}

declare global {
  interface Window {
    contexture: ContextureAPI;
  }
}
