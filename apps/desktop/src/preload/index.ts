/**
 * Preload bridge — the `window.contexture` surface the renderer uses
 * to talk to main over IPC. This is intentionally minimal and typed
 * (see `index.d.ts`); main-side handlers live in `src/main/ipc/*`.
 *
 * Each method either:
 *   - invokes a main-side handler (`ipcRenderer.invoke`) and returns a
 *     promise, or
 *   - subscribes to a main-side event stream (`ipcRenderer.on`) and
 *     returns an unsubscribe function.
 *
 * Renderer code should never touch `ipcRenderer` directly — always go
 * through `window.contexture` so there's one place to audit the main
 * surface.
 */
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
  /** Send a user message and run one chat turn. */
  send: (message: string) =>
    ipcRenderer.invoke('chat:send', message) as Promise<{ ok: boolean; error?: string }>,
  /** Push the current IR to main so the next turn's system prompt has it. */
  setIR: (ir: unknown) => ipcRenderer.send('claude:turn-start-ir', ir),
  onAssistant: (listener: (payload: { text: string }) => void) =>
    subscribe('chat:assistant', listener as (p: unknown) => void),
  onToolUse: (listener: (payload: { name: string; input: unknown }) => void) =>
    subscribe('chat:tool-use', listener as (p: unknown) => void),
  onResult: (listener: (payload: { ok: boolean; error?: string }) => void) =>
    subscribe('chat:result', listener as (p: unknown) => void),
  onError: (listener: (payload: { message: string }) => void) =>
    subscribe('chat:error', listener as (p: unknown) => void),
  /** Turn boundary events from `ChatTurnController`. */
  onTurnBegin: (listener: () => void) => subscribe('turn:begin', listener),
  onTurnCommit: (listener: () => void) => subscribe('turn:commit', listener),
  onTurnRollback: (listener: () => void) => subscribe('turn:rollback', listener),
  /** Reply to an op-request with the renderer's apply result. */
  replyOp: (id: string, result: unknown) => ipcRenderer.send('claude:op-reply', { id, result }),
  onOpRequest: (listener: (payload: { id: string; op: unknown }) => void) =>
    subscribe('claude:op-request', listener as (p: unknown) => void),
};

const contexture = { chat };

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('contexture', contexture);
  } catch (err) {
    console.error(err);
  }
}
