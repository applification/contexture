type Unsubscribe = () => void;

export interface ChatContextAttachment {
  id: string;
  path: string;
  name: string;
  size: number;
  content: string;
  kind?: 'text' | 'image';
  mimeType?: string;
  encoding?: 'base64';
  truncated?: boolean;
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version?: string }
  | { status: 'downloading'; version?: string; progress?: number }
  | { status: 'ready'; version?: string }
  | { status: 'error'; message?: string };

export interface ContextureSchemaAgentAPI {
  send: (
    message: string,
    attachments?: ChatContextAttachment[],
  ) => Promise<{ ok: boolean; error?: string }>;
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
  onAssistantDelta: (
    listener: (payload: { text: string; boundary?: 'new_message' }) => void,
  ) => Unsubscribe;
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
  /** Desktop opens legacy bare IRs directly into bundle mode. */
  mode: 'bundle';
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
      contextAttachments?: Array<{
        id: string;
        path: string;
        name: string;
        size: number;
        kind?: 'text' | 'image';
        mimeType?: string;
        truncated?: boolean;
      }>;
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
  /** Pick a .contexture.json file; returns the absolute path or null if cancelled. */
  pickContextureFile: () => Promise<string | null>;
  /** Pick text files and return their contents as explicit chat context attachments. */
  pickChatContextFiles: (kind?: 'photos' | 'files') => Promise<ChatContextAttachment[]>;
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
  onMenuOpen: (listener: () => void) => Unsubscribe;
  onMenuSave: (listener: () => void) => Unsubscribe;
  onMenuSaveAs: (listener: () => void) => Unsubscribe;
}

export interface ContextureShellAPI {
  /** Reveal the given path in the OS file manager (Finder / Explorer). */
  reveal: (path: string) => Promise<void>;
  /** Open a folder or file in VS Code via the `vscode://` URL scheme. */
  openInEditor: (path: string) => Promise<void>;
  /** Open the OS privacy settings page for file/folder access. */
  openFileAccessSettings: () => Promise<void>;
}

export interface ContextureDriftAPI {
  /** Start watching all manifest files for drift against emitted.json. */
  watch: (payload: { irPath: string }) => Promise<{ ok: boolean }>;
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
  files?: Array<{
    path: string;
    status: 'drifted' | 'missing' | 'unreadable' | 'modified' | 'stale' | 'externally_regenerated';
  }>;
}

export type ModelSyncStatus = 'changed' | 'invalid_json' | 'invalid_ir' | 'unreadable' | 'deleted';

export interface ModelSyncEventPayload {
  irPath: string;
  status: ModelSyncStatus;
  source: 'desktop' | 'mcp' | 'cli' | 'schema_agent' | 'reconcile' | 'external' | 'unknown';
  observedAt: number;
  revision: string;
  content?: string;
  schema?: unknown;
  error?: string;
  change?: unknown;
}

export interface ContextureModelSyncAPI {
  watch: (payload: { irPath: string }) => Promise<{ ok: boolean }>;
  unwatch: () => Promise<{ ok: boolean }>;
  check: () => Promise<{ ok: boolean }>;
  acknowledgeSelfWrite: (payload: { irPath: string; revision: string }) => Promise<{ ok: boolean }>;
  getChangeLog: (payload: { irPath: string }) => Promise<unknown>;
  appendChange: (payload: {
    irPath: string;
    source: 'desktop' | 'schema_agent' | 'reconcile' | 'external';
    reason: 'op_applied' | 'replace_schema' | 'external_sync_accepted';
    before: unknown;
    after: unknown;
    opKind?: string;
    actor?: string;
  }) => Promise<unknown>;
  onEvent: (listener: (payload: ModelSyncEventPayload) => void) => Unsubscribe;
}

export interface ContextureReconcileAPI {
  readGeneratedTarget: (payload: { irPath: string; targetPath: string }) => Promise<string | null>;
  writeGeneratedTarget: (payload: {
    irPath: string;
    targetPath: string;
    contents: string;
  }) => Promise<void>;
  acceptGeneratedTarget: (payload: {
    irPath: string;
    targetPath: string;
    contents: string;
    schema: unknown;
  }) => Promise<void>;
  validateConvexGeneratedTarget: (payload: {
    irPath: string;
    targetPath: string;
  }) => Promise<ConvexCliValidationResult>;
  /**
   * Fire a one-shot schema-agent query that proposes IR ops to align
   * the current schema with the user's hand-edited on-disk source. The
   * returned `ops` array is raw — the renderer validates each entry
   * via the op-applier before showing it in the modal.
   */
  query: (payload: { irJson: string; onDiskSource: string; targetKind: string }) => Promise<{
    ok: boolean;
    ops?: unknown[];
    error?: string;
    deterministicFallbackReason?: string;
  }>;
}

export type ConvexCliValidationResult =
  | { status: 'skipped'; reason: string }
  | { status: 'passed'; command: string; output?: string }
  | { status: 'failed'; command: string; error: string; output?: string };

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
  shell: ContextureShellAPI;
  drift: ContextureDriftAPI;
  modelSync: ContextureModelSyncAPI;
  reconcile: ContextureReconcileAPI;
  update: ContextureUpdateAPI;
}

declare global {
  interface Window {
    contexture: ContextureAPI;
  }
}
