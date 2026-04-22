/**
 * Contexture store — the live IR held in Zustand.
 *
 * This is the thin shell around `store/ops.ts`: it owns a `schema` and
 * exposes `apply(op)` which dispatches through the pure reducer. Successful
 * ops commit the new schema; failing ops leave the state untouched and
 * surface the error string back to the caller (chat channel, UI, etc.) so
 * it can be shown to the user.
 *
 * Undo/redo and transaction batching land in #86 — keeping this store
 * deliberately dumb lets the transactional layer wrap it cleanly.
 */
import { create } from 'zustand';
import type { Schema } from '../model/types';
import { type ApplyResult, apply, type Op } from './ops';

export interface ContextureState {
  schema: Schema;
  apply: (op: Op) => ApplyResult;
}

export function createContextureStore(initial: Schema) {
  return create<ContextureState>((set, get) => ({
    schema: initial,
    apply: (op) => {
      const res = apply(get().schema, op);
      if ('schema' in res) set({ schema: res.schema });
      return res;
    },
  }));
}

/** The default app-wide store, seeded with an empty v1 IR. */
export const useContextureStore = createContextureStore({ version: '1', types: [] });
