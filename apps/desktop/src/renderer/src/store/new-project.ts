/**
 * `useNewProjectStore` — drives the New Project dialog.
 *
 * Holds:
 *   - form state (name, parentDir, isOpen)
 *   - `phase` — where we are in the flow (form → running → done / failed)
 *   - `preflightError` — surfaced in-dialog when stage 0 fails
 *
 * Closing resets everything so reopening doesn't show stale input or
 * lingering errors.
 */
import type { PreflightError } from '@renderer/model/preflight-error-copy';
import { create } from 'zustand';

export type NewProjectPhase = 'form' | 'running' | 'done' | 'failed';

interface NewProjectState {
  isOpen: boolean;
  name: string;
  parentDir: string;
  phase: NewProjectPhase;
  preflightError: PreflightError | null;
  open: () => void;
  close: () => void;
  setName: (name: string) => void;
  setParentDir: (path: string) => void;
  setPreflightError: (err: PreflightError) => void;
  clearPreflightError: () => void;
  setPhase: (phase: NewProjectPhase) => void;
}

const INITIAL = {
  name: '',
  parentDir: '',
  phase: 'form' as NewProjectPhase,
  preflightError: null as PreflightError | null,
};

export const useNewProjectStore = create<NewProjectState>((set) => ({
  isOpen: false,
  ...INITIAL,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, ...INITIAL }),
  setName: (name) => set({ name }),
  setParentDir: (parentDir) => set({ parentDir }),
  setPreflightError: (preflightError) => set({ preflightError, phase: 'failed' }),
  clearPreflightError: () => set({ preflightError: null }),
  setPhase: (phase) => set({ phase }),
}));
