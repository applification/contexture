/**
 * `useReconcileStore` — UI state for the drift-reconciliation modal.
 *
 * The modal is opened from the DriftBanner's "Review changes" button
 * when the watched Convex schema has been hand-edited. It hosts a
 * checklist of LLM-proposed ops on the left and a live `@pierre/diffs`
 * split view on the right. This store holds only UI state — the IR
 * itself stays in `useUndoStore` and is mutated through the normal
 * op-applier when the user clicks "Apply selected".
 *
 * Status transitions:
 *   open()       → status='loading'
 *   setReady     → status='ready'  (selectedIndices initialised to all)
 *   setError     → status='error'
 *   setApplying  → status='applying' (disables the Apply button)
 *   close()      → reset, then isOpen=false
 *
 * `selectedIndices` is a Set; `toggleOp` always allocates a fresh Set
 * so Zustand triggers a re-render (it relies on referential
 * inequality).
 */
import { create } from 'zustand';
import type { Op } from './ops';

export type ReconcileStatus = 'idle' | 'loading' | 'ready' | 'error' | 'applying';

export interface ReconcileOp {
  /** Stable React-list key. Generated when the op enters the store. */
  id: string;
  /** The underlying IR op the LLM proposes. Validated through the op-applier before reaching this store. */
  op: Op;
  /** Human-readable one-line summary, e.g. "Add field 'title' to Post". */
  label: string;
  /** True when the op is destructive (delete, rename, type change). Renders a ⚠ badge. */
  lossy: boolean;
}

interface ReconcileState {
  isOpen: boolean;
  status: ReconcileStatus;
  proposedOps: ReconcileOp[];
  selectedIndices: Set<number>;
  error: string | null;
  /** On-disk contents of `convex/schema.ts` captured when the modal opened. */
  convexSource: string | null;

  open: () => void;
  close: () => void;
  setLoading: () => void;
  setReady: (ops: ReconcileOp[], convexSource: string) => void;
  setError: (message: string) => void;
  setApplying: () => void;
  toggleOp: (index: number) => void;
  selectAll: () => void;
  selectNone: () => void;
  reset: () => void;
}

const INITIAL: Omit<
  ReconcileState,
  | 'open'
  | 'close'
  | 'setLoading'
  | 'setReady'
  | 'setError'
  | 'setApplying'
  | 'toggleOp'
  | 'selectAll'
  | 'selectNone'
  | 'reset'
> = {
  isOpen: false,
  status: 'idle',
  proposedOps: [],
  selectedIndices: new Set(),
  error: null,
  convexSource: null,
};

export const useReconcileStore = create<ReconcileState>((set, get) => ({
  ...INITIAL,

  open: () =>
    set({
      isOpen: true,
      status: 'loading',
      proposedOps: [],
      selectedIndices: new Set(),
      error: null,
      convexSource: null,
    }),

  close: () => set({ ...INITIAL }),

  setLoading: () => set({ status: 'loading', error: null }),

  setReady: (ops, convexSource) =>
    set({
      status: 'ready',
      proposedOps: ops,
      selectedIndices: new Set(ops.map((_, i) => i)),
      convexSource,
      error: null,
    }),

  setError: (message) => set({ status: 'error', error: message }),

  setApplying: () => set({ status: 'applying' }),

  toggleOp: (index) => {
    const next = new Set(get().selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    set({ selectedIndices: next });
  },

  selectAll: () => set({ selectedIndices: new Set(get().proposedOps.map((_, i) => i)) }),

  selectNone: () => set({ selectedIndices: new Set() }),

  reset: () => set({ ...INITIAL }),
}));
