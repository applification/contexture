/**
 * Transaction-aware undo store.
 *
 * Wraps the pure ops reducer (`./ops`) with a linear undo/redo history
 * and transaction semantics so:
 *
 *   - A direct-manipulation action (single `apply`) becomes a single
 *     undo entry.
 *   - A chat turn wraps its N op applications in `begin()` / `commit()`
 *     so the whole turn collapses to one entry (and one undo reverses
 *     all of it at once).
 *   - `rollback()` throws away everything since `begin()` and restores
 *     the pre-begin snapshot without adding an undo entry — used when
 *     a chat turn aborts mid-stream.
 *   - Nested `begin()` is depth-counted: inner `commit()`s are no-ops;
 *     only the outermost commit pushes an entry. This lets higher-level
 *     flows compose without knowing whether they're already inside a
 *     transaction.
 *
 * The store holds the live IR as a plain snapshot (`past[i]` is a full
 * `Schema`) rather than a list of ops. IR instances are small and we
 * need O(1) undo restore; replaying ops would also force us to re-run
 * every validation pass.
 */

import type { Schema } from '@contexture/core/ir';
import { load, save } from '@contexture/core/load';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { create } from 'zustand';
import { type ApplyResult, apply as applyOp, type Op } from './ops';

export interface UndoMutationMeta {
  source?: 'desktop' | 'schema_agent' | 'reconcile' | 'external';
  actor?: string;
  log?: boolean;
}

export interface UndoMutationEvent {
  op: Op;
  before: Schema;
  after: Schema;
  meta: UndoMutationMeta;
}

export type UndoMutationListener = (event: UndoMutationEvent) => void;
export interface UndoHistoryEvent {
  action: 'undo' | 'redo';
  before: Schema;
  after: Schema;
}

export type UndoHistoryListener = (event: UndoHistoryEvent) => void;

const mutationListeners = new Set<UndoMutationListener>();
const historyListeners = new Set<UndoHistoryListener>();

export interface UndoableState {
  schema: Schema;
  /** Past snapshots, oldest first. `past[past.length-1]` is the most recent pre-step schema. */
  past: Schema[];
  /** Future snapshots populated by `undo`, newest first. */
  future: Schema[];
  /** Active transaction depth. 0 means "no transaction open". */
  txDepth: number;
  /** Snapshot captured at the outermost `begin()`. null when no tx is open. */
  txStart: Schema | null;

  apply: (op: Op, meta?: UndoMutationMeta) => ApplyResult;
  undo: () => void;
  redo: () => void;
  begin: () => void;
  commit: () => void;
  rollback: () => void;

  canUndo: boolean;
  canRedo: boolean;
}

export type UndoableContextureStore = ReturnType<typeof createUndoableContextureStore>;

export function createUndoableContextureStore(initial: Schema) {
  return create<UndoableState>((set, get) => {
    const recompute = (past: Schema[], future: Schema[]) => ({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
    });

    return {
      schema: initial,
      past: [],
      future: [],
      txDepth: 0,
      txStart: null,
      canUndo: false,
      canRedo: false,

      apply: (op, meta = {}) => {
        const state = get();
        const res = applyOp(state.schema, op, STDLIB_REGISTRY);
        if ('error' in res) return res;

        if (state.txDepth > 0) {
          // Inside a transaction: mutate the live schema but defer the
          // history push until `commit()`.
          set({ schema: res.schema });
          notifyMutation(mutationListeners, { op, before: state.schema, after: res.schema, meta });
          return res;
        }

        const past = [...state.past, state.schema];
        const future: Schema[] = [];
        set({ schema: res.schema, past, future, ...recompute(past, future) });
        notifyMutation(mutationListeners, { op, before: state.schema, after: res.schema, meta });
        return res;
      },

      undo: () => {
        const state = get();
        if (state.past.length === 0) return;
        const past = state.past.slice(0, -1);
        const prev = state.past[state.past.length - 1];
        const future = [state.schema, ...state.future];
        set({ schema: prev, past, future, ...recompute(past, future) });
        notifyHistory(historyListeners, { action: 'undo', before: state.schema, after: prev });
      },

      redo: () => {
        const state = get();
        if (state.future.length === 0) return;
        const [next, ...future] = state.future;
        const past = [...state.past, state.schema];
        set({ schema: next, past, future, ...recompute(past, future) });
        notifyHistory(historyListeners, { action: 'redo', before: state.schema, after: next });
      },

      begin: () => {
        const state = get();
        if (state.txDepth === 0) {
          set({ txDepth: 1, txStart: state.schema });
        } else {
          set({ txDepth: state.txDepth + 1 });
        }
      },

      commit: () => {
        const state = get();
        if (state.txDepth === 0) return;
        if (state.txDepth > 1) {
          set({ txDepth: state.txDepth - 1 });
          return;
        }
        // Outermost commit: land one undo entry iff the schema changed.
        const changed = state.txStart !== null && state.txStart !== state.schema;
        if (!changed || state.txStart === null) {
          set({ txDepth: 0, txStart: null });
          return;
        }
        const past = [...state.past, state.txStart];
        const future: Schema[] = [];
        set({ txDepth: 0, txStart: null, past, future, ...recompute(past, future) });
      },

      rollback: () => {
        const state = get();
        if (state.txDepth === 0 || state.txStart === null) return;
        set({ schema: state.txStart, txDepth: 0, txStart: null });
      },
    };
  });
}

/**
 * App-wide undoable store seeded with an empty v1 IR. Detail panels and
 * canvas interactions dispatch every mutation through `useUndoStore.getState().apply()`
 * so direct-manipulation edits become single-entry undo steps and the
 * chat turn binder (see `chat/turn-binder.ts`) can wrap a chain of ops
 * in one transaction.
 */
export const useUndoStore = createUndoableContextureStore({ version: '1', types: [] });

export function subscribeUndoMutations(listener: UndoMutationListener): () => void {
  mutationListeners.add(listener);
  return () => {
    mutationListeners.delete(listener);
  };
}

export function subscribeUndoHistory(listener: UndoHistoryListener): () => void {
  historyListeners.add(listener);
  return () => {
    historyListeners.delete(listener);
  };
}

function notifyMutation(listeners: Set<UndoMutationListener>, event: UndoMutationEvent): void {
  for (const listener of listeners) listener(event);
}

function notifyHistory(listeners: Set<UndoHistoryListener>, event: UndoHistoryEvent): void {
  for (const listener of listeners) listener(event);
}

// Expose the store on `window` only in test/dev/e2e so Playwright specs can
// dispatch ops directly without relying on XYFlow pointer events.
function shouldExposeTestHooks(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') return true;
  return new URLSearchParams(window.location.search).get('e2e') === '1';
}

if (shouldExposeTestHooks()) {
  (window as unknown as { __contextureUndoStore?: typeof useUndoStore }).__contextureUndoStore =
    useUndoStore;
  // Playwright's `page.evaluate` can't dynamic-import renderer modules in
  // production builds (they live under hashed filenames). Expose the
  // load/save helpers on `window` so e2e specs can exercise the
  // round-trip without relying on module resolution.
  (
    window as unknown as { __contextureModel?: { load: typeof load; save: typeof save } }
  ).__contextureModel = { load, save };
}
