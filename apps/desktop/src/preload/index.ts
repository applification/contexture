/**
 * Preload bridge — `window.contexture` is the curated renderer surface.
 * Everything goes through one allowlist of IPC channels so there's a
 * single place to audit main-side handlers.
 *
 * Each method either:
 *   - invokes a main-side handler (`ipcRenderer.invoke`) and returns a
 *     promise, or
 *   - subscribes to a main-side event stream (`ipcRenderer.on`) and
 *     returns an unsubscribe function.
 *
 * Renderer code should never touch `ipcRenderer` directly.
 */
import { contextBridge, ipcRenderer } from 'electron';

type Unsubscribe = () => void;

function subscribe(channel: string, listener: (payload: unknown) => void): Unsubscribe {
  const handler = (_evt: unknown, payload: unknown) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const schemaAgent = {
  send: (message: string, attachments = []) =>
    ipcRenderer.invoke('schema-agent:send', { message, attachments }) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  setIR: (ir: unknown) => ipcRenderer.send('schema-agent:set-ir', ir),
  abort: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('schema-agent:abort') as Promise<{ ok: boolean; error?: string }>,
  getStatus: () => ipcRenderer.invoke('schema-agent:get-status'),
  listModels: (provider?: 'codex' | 'claude') =>
    ipcRenderer.invoke('schema-agent:list-models', provider),
  setProvider: (provider: 'codex' | 'claude'): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('schema-agent:set-provider', provider) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  setModelOptions: (options: {
    model?: string;
    effort?: string;
    options?: Record<string, string | boolean>;
  }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('schema-agent:set-model-options', options) as Promise<{ ok: boolean }>,
  startLogin: (input: { mode: 'chatgpt' | 'api-key' | 'cli-session'; apiKey?: string }) =>
    ipcRenderer.invoke('schema-agent:start-login', input),
  cancelLogin: (input: { flowId: string }): Promise<void> =>
    ipcRenderer.invoke('schema-agent:cancel-login', input) as Promise<void>,
  logout: (): Promise<void> => ipcRenderer.invoke('schema-agent:logout') as Promise<void>,
  threadSet: (thread: unknown): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('schema-agent:thread-set', thread) as Promise<{ ok: boolean }>,
  threadClear: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('schema-agent:thread-clear') as Promise<{ ok: boolean }>,
  replyTool: (id: string, result: unknown) =>
    ipcRenderer.send('schema-agent:tool-reply', { id, result }),
  onAssistantDelta: (listener: (payload: { text: string; boundary?: 'new_message' }) => void) =>
    subscribe('schema-agent:assistant-delta', listener as (p: unknown) => void),
  onAssistantFinal: (listener: (payload: { text: string }) => void) =>
    subscribe('schema-agent:assistant-final', listener as (p: unknown) => void),
  onToolCallStarted: (listener: (payload: { id: string; name: string; input?: unknown }) => void) =>
    subscribe('schema-agent:tool-call-started', listener as (p: unknown) => void),
  onToolCallFinished: (
    listener: (payload: { id: string; name: string; ok: boolean; result?: unknown }) => void,
  ) => subscribe('schema-agent:tool-call-finished', listener as (p: unknown) => void),
  onError: (listener: (payload: { message: string }) => void) =>
    subscribe('schema-agent:error', listener as (p: unknown) => void),
  onStatusChanged: (listener: (payload: unknown) => void) =>
    subscribe('schema-agent:status-changed', listener),
  onThreadUpdated: (listener: (payload: { thread: unknown }) => void) =>
    subscribe('schema-agent:thread-updated', listener as (p: unknown) => void),
  onThreadDesynced: (listener: (payload: { thread: unknown; reason: string }) => void) =>
    subscribe('schema-agent:thread-desynced', listener as (p: unknown) => void),
  onToolRequest: (listener: (payload: { id: string; op: unknown }) => void) =>
    subscribe('schema-agent:tool-request', listener as (p: unknown) => void),
  onTurnBegin: (listener: () => void) => subscribe('turn:begin', listener),
  onTurnCommit: (listener: () => void) => subscribe('turn:commit', listener),
  onTurnRollback: (listener: () => void) => subscribe('turn:rollback', listener),
};

// Open results carry the full bundle (IR raw text + parsed sidecars).
// The `.d.ts` declares the canonical `OpenedDocument` shape; here we
// pass the IPC value through unchanged — the renderer sees the typed
// version via `window.contexture.file.*`.
const file = {
  /** Show the OS open dialog and return the bundle + raw IR. */
  openDialog: () => ipcRenderer.invoke('file:open-dialog'),
  /** Show the OS save-as dialog and return the chosen path. */
  saveAsDialog: () => ipcRenderer.invoke('file:save-as-dialog') as Promise<string | null>,
  /** Show a directory picker; returns the selected folder or null if cancelled. */
  pickDirectory: () => ipcRenderer.invoke('file:pick-directory') as Promise<string | null>,
  /** Show a file picker filtered to .contexture.json; returns path or null if cancelled. */
  pickContextureFile: () =>
    ipcRenderer.invoke('file:pick-contexture-file') as Promise<string | null>,
  /** Pick text files and return contents to attach to the next chat turn. */
  pickChatContextFiles: (kind = 'files') =>
    ipcRenderer.invoke('file:pick-chat-context-files', { kind }),
  /** Write the five-file bundle atomically under `irPath`. */
  save: (payload: {
    irPath: string;
    schema: unknown;
    layout: unknown;
    chat: unknown;
  }): Promise<void> => ipcRenderer.invoke('file:save', payload) as Promise<void>,
  /** Read a `.contexture.json` bundle by absolute path (no dialog). */
  read: (irPath: string) => ipcRenderer.invoke('file:read', irPath),
  /** List of most-recently-opened paths (most-recent first). */
  getRecentFiles: () => ipcRenderer.invoke('file:recent-files') as Promise<string[]>,
  /** Open a path from the recent-files list; returns null if it's gone. */
  openRecent: (filePath: string) => ipcRenderer.invoke('file:open-recent', filePath),
  /** Menu-bar -> renderer subscriptions. */
  onMenuNew: (listener: () => void) =>
    subscribe('menu:file-new', (() => listener()) as (p: unknown) => void),
  onMenuOpen: (listener: () => void) =>
    subscribe('menu:file-open', (() => listener()) as (p: unknown) => void),
  onMenuSave: (listener: () => void) =>
    subscribe('menu:file-save', (() => listener()) as (p: unknown) => void),
  onMenuSaveAs: (listener: () => void) =>
    subscribe('menu:file-save-as', (() => listener()) as (p: unknown) => void),
};

const shell = {
  /** Reveal a file or folder in the OS file manager (Finder / Explorer). */
  reveal: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:reveal', path) as Promise<void>,
  /** Open a folder (or file) in VS Code via the `vscode://` URL scheme. */
  openInEditor: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-in-editor', path) as Promise<void>,
  /** Open the OS privacy settings page for file/folder access. */
  openFileAccessSettings: (): Promise<void> =>
    ipcRenderer.invoke('shell:open-file-access-settings') as Promise<void>,
};

const drift = {
  /** Start watching all manifest files for drift; stops any previous watcher. */
  watch: (payload: { irPath: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('drift:watch', payload) as Promise<{ ok: boolean }>,
  /** Stop the active watcher. */
  unwatch: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('drift:unwatch') as Promise<{ ok: boolean }>,
  /** Trigger a manual hash re-check (called on window focus). */
  check: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('drift:check') as Promise<{ ok: boolean }>,
  /** Reset the main-side drifted flag after user dismisses the banner. */
  dismiss: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('drift:dismiss') as Promise<{ ok: boolean }>,
  onDetected: (listener: (payload: { paths: string[] }) => void) =>
    subscribe('drift:detected', listener as (p: unknown) => void),
  onResolved: (listener: () => void) =>
    subscribe('drift:resolved', (() => listener()) as (p: unknown) => void),
};

const convex = {
  versionInfo: (payload: { irPath: string }) =>
    ipcRenderer.invoke('convex:version-info', payload) as Promise<{
      emitterVersion: string;
      targetVersion: string | null;
      targetPackagePath: string | null;
      status: 'ok' | 'mismatch' | 'target_missing' | 'probe_failed';
      message: string;
    }>,
  agentReadiness: (payload: { irPath: string }) =>
    ipcRenderer.invoke('convex:agent-readiness', payload) as Promise<{
      convexAiFiles: {
        status: 'ready' | 'not_ready' | 'probe_failed';
        message: string;
        command: string;
      };
      contextureMcp: {
        status: 'ready' | 'not_ready' | 'probe_failed';
        message: string;
        command: string;
      };
    }>,
};

const modelSync = {
  watch: (payload: { irPath: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('model-sync:watch', payload) as Promise<{ ok: boolean }>,
  unwatch: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('model-sync:unwatch') as Promise<{ ok: boolean }>,
  check: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('model-sync:check') as Promise<{ ok: boolean }>,
  acknowledgeSelfWrite: (payload: { irPath: string; revision: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('model-sync:acknowledge-self-write', payload) as Promise<{ ok: boolean }>,
  getChangeLog: (payload: { irPath: string }): Promise<unknown> =>
    ipcRenderer.invoke('model-sync:change-log', payload),
  appendChange: (payload: {
    irPath: string;
    source: 'desktop' | 'schema_agent' | 'reconcile' | 'external';
    reason: 'op_applied' | 'replace_schema' | 'external_sync_accepted';
    before: unknown;
    after: unknown;
    opKind?: string;
    actor?: string;
  }): Promise<unknown> => ipcRenderer.invoke('model-sync:append-change', payload),
  onEvent: (listener: (payload: unknown) => void) => subscribe('model-sync:event', listener),
};

const reconcile = {
  readGeneratedTarget: (payload: { irPath: string; targetPath: string }): Promise<string | null> =>
    ipcRenderer.invoke('reconcile:read-generated-target', payload) as Promise<string | null>,
  writeGeneratedTarget: (payload: {
    irPath: string;
    targetPath: string;
    contents: string;
  }): Promise<void> =>
    ipcRenderer.invoke('reconcile:write-generated-target', payload) as Promise<void>,
  acceptGeneratedTarget: (payload: {
    irPath: string;
    targetPath: string;
    contents: string;
    schema: unknown;
  }): Promise<void> =>
    ipcRenderer.invoke('reconcile:accept-generated-target', payload) as Promise<void>,
  validateConvexGeneratedTarget: (payload: {
    irPath: string;
    targetPath: string;
  }): Promise<{
    status: 'skipped' | 'passed' | 'failed';
    reason?: string;
    command?: string;
    error?: string;
    output?: string;
  }> =>
    ipcRenderer.invoke('reconcile:validate-convex-generated-target', payload) as Promise<{
      status: 'skipped' | 'passed' | 'failed';
      reason?: string;
      command?: string;
      error?: string;
      output?: string;
    }>,
  /**
   * Fire a one-shot schema-agent query that returns reconcile ops for
   * the current IR + on-disk source of any emitted file.
   */
  query: (payload: {
    irJson: string;
    onDiskSource: string;
    targetKind: string;
  }): Promise<{
    ok: boolean;
    ops?: unknown[];
    error?: string;
    deterministicFallbackReason?: string;
  }> =>
    ipcRenderer.invoke('schema-agent:reconcile', payload) as Promise<{
      ok: boolean;
      ops?: unknown[];
      error?: string;
      deterministicFallbackReason?: string;
    }>,
};

const update = {
  getState: () => ipcRenderer.invoke('update:get-state'),
  onState: (listener: (state: unknown) => void) => subscribe('update:state', listener),
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => {
    void ipcRenderer.invoke('update:install');
  },
  openReleasesPage: () => {
    void ipcRenderer.invoke('update:open-releases');
  },
};

const contexture = { schemaAgent, file, shell, drift, convex, modelSync, reconcile, update };

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('contexture', contexture);
  } catch (err) {
    console.error(err);
  }
}
