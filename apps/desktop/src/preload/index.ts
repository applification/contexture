/**
 * Preload bridge — `window.contexture` is the new curated surface, and
 * `window.api` carries legacy methods the pre-pivot renderer still uses
 * (UpdateBanner, useLayoutSidecar, useChatSidecar). Everything goes
 * through one allowlist of IPC channels so there's a single place to
 * audit main-side handlers.
 *
 * Each method either:
 *   - invokes a main-side handler (`ipcRenderer.invoke`) and returns a
 *     promise, or
 *   - subscribes to a main-side event stream (`ipcRenderer.on`) and
 *     returns an unsubscribe function.
 *
 * Renderer code should never touch `ipcRenderer` directly.
 */
import { promises as fs } from 'node:fs';
import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge, ipcRenderer } from 'electron';

type Unsubscribe = () => void;

function subscribe(channel: string, listener: (payload: unknown) => void): Unsubscribe {
  const handler = (_evt: unknown, payload: unknown) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const chat = {
  send: (message: string) =>
    ipcRenderer.invoke('chat:send', message) as Promise<{ ok: boolean; error?: string }>,
  setIR: (ir: unknown) => ipcRenderer.send('claude:turn-start-ir', ir),
  /** Is the `claude` CLI binary on PATH? Used by the auth popover. */
  detectClaudeCli: () =>
    ipcRenderer.invoke('claude:detect-cli') as Promise<{
      installed: boolean;
      path: string | null;
    }>,
  /** Swap between Max (CLI / OAuth) and api-key auth. */
  setAuth: (
    auth: { mode: 'max' } | { mode: 'api-key'; key: string },
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('claude:set-auth', auth) as Promise<{ ok: boolean; error?: string }>,
  /** Update the model + thinking-effort used by the next SDK query. */
  setModelOptions: (opts: {
    model?: string;
    thinkingBudget?: 'auto' | 'low' | 'med' | 'high';
  }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('claude:set-model-options', opts) as Promise<{ ok: boolean }>,
  /** Interrupt the in-flight query (stop button). */
  abort: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('chat:abort') as Promise<{ ok: boolean; error?: string }>,
  onAssistant: (listener: (payload: { text: string }) => void) =>
    subscribe('chat:assistant', listener as (p: unknown) => void),
  onToolUse: (listener: (payload: { name: string; input: unknown }) => void) =>
    subscribe('chat:tool-use', listener as (p: unknown) => void),
  onResult: (listener: (payload: { ok: boolean; error?: string }) => void) =>
    subscribe('chat:result', listener as (p: unknown) => void),
  onError: (listener: (payload: { message: string }) => void) =>
    subscribe('chat:error', listener as (p: unknown) => void),
  /**
   * Emitted when the SDK reports an authentication failure (401 /
   * expired Claude Max token / missing API key). The renderer surfaces
   * a re-auth CTA rather than a generic error bubble.
   */
  onAuthRequired: (listener: (payload: { message: string }) => void) =>
    subscribe('chat:auth-required', listener as (p: unknown) => void),
  onTurnBegin: (listener: () => void) => subscribe('turn:begin', listener),
  onTurnCommit: (listener: () => void) => subscribe('turn:commit', listener),
  onTurnRollback: (listener: () => void) => subscribe('turn:rollback', listener),
  replyOp: (id: string, result: unknown) => ipcRenderer.send('claude:op-reply', { id, result }),
  onOpRequest: (listener: (payload: { id: string; op: unknown }) => void) =>
    subscribe('claude:op-request', listener as (p: unknown) => void),
  /**
   * Stream of Agent SDK session ids — emitted from main on every SDK
   * message that carries one. The renderer persists the last-seen id
   * to the chat sidecar so follow-up turns can `resume` it.
   */
  onSession: (listener: (payload: { sessionId: string }) => void) =>
    subscribe('chat:session', listener as (p: unknown) => void),
  /** Restore a persisted sessionId into main (on sidecar hydrate). */
  setSessionId: (sessionId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('chat:set-session-id', sessionId) as Promise<{ ok: boolean }>,
  /** Forget the current sessionId (start a fresh conversation). */
  clearSession: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('chat:clear-session') as Promise<{ ok: boolean }>,
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
  onMenuNewProject: (listener: () => void) =>
    subscribe('menu:file-new-project', (() => listener()) as (p: unknown) => void),
  onMenuOpen: (listener: () => void) =>
    subscribe('menu:file-open', (() => listener()) as (p: unknown) => void),
  onMenuSave: (listener: () => void) =>
    subscribe('menu:file-save', (() => listener()) as (p: unknown) => void),
  onMenuSaveAs: (listener: () => void) =>
    subscribe('menu:file-save-as', (() => listener()) as (p: unknown) => void),
};

const scaffold = {
  /** Kick off the composable scaffolder; events arrive on `onEvent`. */
  start: (config: {
    targetDir: string;
    projectName: string;
    apps: string[];
    description?: string;
    scratchPath?: string;
  }) => ipcRenderer.invoke('scaffold:start', config) as Promise<void>,
  /** Subscribe to preflight + stage events streamed from main. */
  onEvent: (listener: (event: unknown) => void) =>
    subscribe('scaffold:event', listener as (p: unknown) => void),
};

const shell = {
  /** Reveal a file or folder in the OS file manager (Finder / Explorer). */
  reveal: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:reveal', path) as Promise<void>,
  /** Open a folder (or file) in VS Code via the `vscode://` URL scheme. */
  openInEditor: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-in-editor', path) as Promise<void>,
};

const project = {
  /** Recursively delete a directory (used by the New Project "delete and start over" flow). */
  deleteDirectory: (path: string): Promise<void> =>
    ipcRenderer.invoke('project:delete-directory', path) as Promise<void>,
};

const drift = {
  /** Start watching a file for drift; stops any previous watcher. */
  watch: (payload: { watchedPath: string; emittedJsonPath: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('drift:watch', payload) as Promise<{ ok: boolean }>,
  /** Stop the active watcher. */
  unwatch: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('drift:unwatch') as Promise<{ ok: boolean }>,
  /** Trigger a manual hash re-check (called on window focus). */
  check: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('drift:check') as Promise<{ ok: boolean }>,
  onDetected: (listener: () => void) =>
    subscribe('drift:detected', (() => listener()) as (p: unknown) => void),
  onResolved: (listener: () => void) =>
    subscribe('drift:resolved', (() => listener()) as (p: unknown) => void),
};

const contexture = { chat, file, scaffold, shell, project, drift };

/**
 * Legacy surface. Sidecar reads/writes use the preload process's
 * Node `fs` directly — the files live next to the open document and
 * don't need a main-side dialog. Update + menu handlers route through
 * the existing `update:*` / `file:*` IPC channels.
 */
const legacyApi = {
  readFileSilent: async (path: string): Promise<string | null> => {
    try {
      return await fs.readFile(path, 'utf-8');
    } catch {
      return null;
    }
  },
  saveFile: async (path: string, contents: string): Promise<void> => {
    await fs.writeFile(path, contents, 'utf-8');
  },
  openFile: () => ipcRenderer.invoke('file:open-dialog'),
  saveFileAs: () => ipcRenderer.invoke('file:save-as-dialog'),
  onMenuFileOpen: (listener: (path: string) => void) =>
    subscribe('menu:file-open', listener as (p: unknown) => void),
  onMenuFileSave: (listener: () => void) =>
    subscribe('menu:file-save', (() => listener()) as (p: unknown) => void),
  onMenuFileSaveAs: (listener: () => void) =>
    subscribe('menu:file-save-as', (() => listener()) as (p: unknown) => void),

  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  onUpdateState: (listener: (state: unknown) => void) => subscribe('update:state', listener),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => {
    void ipcRenderer.invoke('update:install');
  },
  openReleasesPage: () => {
    void ipcRenderer.invoke('update:open-releases');
  },

  // Legacy assistant channels kept as no-ops so `ImprovementHUD` won't
  // crash on import — the pre-pivot UI lands in the bin when the new
  // App shell fully replaces it.
  onClaudeAssistantText:
    (_listener: (text: string) => void): Unsubscribe =>
    () =>
      undefined,
  onClaudeResult:
    (_listener: (r?: unknown) => void): Unsubscribe =>
    () =>
      undefined,
  onClaudeError:
    (_listener: (e?: unknown) => void): Unsubscribe =>
    () =>
      undefined,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('contexture', contexture);
    contextBridge.exposeInMainWorld('api', legacyApi);
  } catch (err) {
    console.error(err);
  }
}
