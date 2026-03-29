import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge, ipcRenderer } from 'electron';

type Callback<T extends unknown[] = []> = (...args: T) => void;

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  version?: string;
  progress?: number;
  error?: string;
};

function onChannel<T extends unknown[]>(channel: string, callback: Callback<T>): () => void {
  const handler = (_event: unknown, ...args: unknown[]): void => callback(...(args as T));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  // File operations
  openFile: (): Promise<{ filePath: string; content: string } | null> =>
    ipcRenderer.invoke('file:open'),
  saveFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('file:save', filePath, content),
  saveFileAs: (content: string): Promise<string | null> =>
    ipcRenderer.invoke('file:save-as', content),
  readFileSilent: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('file:read-silent', filePath),
  getRecentFiles: (): Promise<string[]> => ipcRenderer.invoke('file:recent-files'),
  openRecentFile: (filePath: string): Promise<{ filePath: string; content: string } | null> =>
    ipcRenderer.invoke('file:open-recent', filePath),

  // Menu events
  onMenuFileNew: (callback: () => void) => onChannel('menu:file-new', callback),
  onMenuFileOpen: (callback: () => void) => onChannel('menu:file-open', callback),
  onMenuFileSave: (callback: () => void) => onChannel('menu:file-save', callback),
  onMenuFileSaveAs: (callback: () => void) => onChannel('menu:file-save-as', callback),

  // Claude operations
  detectClaudeCli: (): Promise<{ installed: boolean; path: string | null }> =>
    ipcRenderer.invoke('claude:detect-cli'),
  sendMessage: (
    message: string,
    auth: { mode: 'api-key'; key: string } | { mode: 'max'; binaryPath?: string },
    modelOptions?: { model?: string; thinkingBudgetTokens?: number },
  ): Promise<void> => ipcRenderer.invoke('claude:send-message', message, auth, modelOptions),
  abortClaude: (): Promise<void> => ipcRenderer.invoke('claude:abort'),
  resetSession: (): Promise<void> => ipcRenderer.invoke('claude:reset-session'),

  // Claude events from main → renderer
  onClaudeAssistantText: (callback: Callback<[string]>) =>
    onChannel('claude:assistant-text', callback),
  onClaudeToolUse: (callback: Callback<[string, unknown]>) =>
    onChannel('claude:tool-use', callback),
  onClaudeResult: (callback: Callback<[string, number]>) => onChannel('claude:result', callback),
  onClaudeError: (callback: Callback<[string]>) => onChannel('claude:error', callback),

  // Claude tool callbacks (main process requesting data from renderer)
  onClaudeGetOntology: (callback: () => void) => onChannel('claude:get-ontology', callback),
  onClaudeLoadOntology: (callback: Callback<[string]>) =>
    onChannel('claude:load-ontology', callback),
  onClaudeAddClass: (
    callback: Callback<[{ uri: string; label?: string; comment?: string; subClassOf?: string[] }]>,
  ) => onChannel('claude:add-class', callback),
  onClaudeAddObjectProperty: (
    callback: Callback<
      [{ uri: string; label?: string; comment?: string; domain: string[]; range: string[] }]
    >,
  ) => onChannel('claude:add-object-property', callback),
  onClaudeAddDatatypeProperty: (
    callback: Callback<[{ uri: string; label?: string; domain: string[]; range: string }]>,
  ) => onChannel('claude:add-datatype-property', callback),
  onClaudeModifyClass: (callback: Callback<[string, Record<string, unknown>]>) =>
    onChannel('claude:modify-class', callback),
  onClaudeRemoveElement: (callback: Callback<[string, string]>) =>
    onChannel('claude:remove-element', callback),
  onClaudeValidate: (callback: () => void) => onChannel('claude:validate', callback),

  // Eval operations
  runEval: (payload: {
    turtle: string;
    domain: string;
    intendedUse: string;
    auth: { mode: 'api-key'; key: string } | { mode: 'max' };
    model: string;
    effort: string;
  }): Promise<void> => ipcRenderer.invoke('eval:run', payload),
  abortEval: (): Promise<void> => ipcRenderer.invoke('eval:abort'),
  onEvalText: (callback: Callback<[string]>) => onChannel('eval:text', callback),
  onEvalResult: (callback: Callback<[string]>) => onChannel('eval:result', callback),
  onEvalError: (callback: Callback<[string]>) => onChannel('eval:error', callback),

  // Respond to main process requests
  respondOntology: (turtle: string): void => {
    ipcRenderer.invoke('claude:ontology-response', { turtle });
  },
  respondValidation: (errors: string): void => {
    ipcRenderer.invoke('claude:validation-response', errors);
  },

  // Update operations
  checkForUpdate: (): Promise<void> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('update:download'),
  installUpdate: (): void => {
    ipcRenderer.invoke('update:install');
  },
  openReleasesPage: (): void => {
    ipcRenderer.invoke('update:open-releases');
  },
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke('update:get-state'),
  onUpdateState: (callback: (state: UpdateState) => void): (() => void) =>
    onChannel<[UpdateState]>('update:state', callback),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error
  window.electron = electronAPI;
  // @ts-expect-error
  window.api = api;
}
