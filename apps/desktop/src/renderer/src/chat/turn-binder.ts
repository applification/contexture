/**
 * Renderer-side binder for the chat turn boundary protocol.
 *
 * Subscribes to the `turn:begin` / `turn:commit` / `turn:rollback`
 * messages that `ChatTurnController` emits from main, and drives an
 * undo store's transaction API so an entire chat turn collapses into
 * one undo entry. Per-op animation still happens live: each `add_type`
 * (etc.) arrives via the existing `claude:op-request` channel and is
 * applied to the store individually — the transaction only controls
 * how the undo stack groups those mutations.
 *
 * Kept transport- and store-agnostic so it can be exercised in Vitest
 * without Electron or Zustand; the chat UI (issue #98) supplies the
 * real `ipcRenderer` adapter and the app's undo store.
 */

/** Unsubscribe function returned by `IpcSubscriber.on`. */
export type IpcSubscription = () => void;

export interface IpcSubscriber {
  /** Subscribe to a channel; return an unsubscribe function. */
  on: (channel: string, listener: () => void) => IpcSubscription;
}

export interface TurnUndoStore {
  begin: () => void;
  commit: () => void;
  rollback: () => void;
}

export const TURN_BEGIN = 'turn:begin';
export const TURN_COMMIT = 'turn:commit';
export const TURN_ROLLBACK = 'turn:rollback';

/**
 * Wire `turn:*` messages to the undo store. Returns a function that
 * removes all three listeners — call it when the chat surface unmounts.
 */
export function bindTurnToUndo(ipc: IpcSubscriber, undo: TurnUndoStore): () => void {
  const subs: IpcSubscription[] = [
    ipc.on(TURN_BEGIN, () => undo.begin()),
    ipc.on(TURN_COMMIT, () => undo.commit()),
    ipc.on(TURN_ROLLBACK, () => undo.rollback()),
  ];
  return () => {
    for (const unsub of subs) unsub();
  };
}
