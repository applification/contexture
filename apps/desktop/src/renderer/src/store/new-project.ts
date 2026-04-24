/**
 * `useNewProjectStore` — drives the New Project dialog.
 *
 * Holds the form state (name, parentDir) plus the dialog's open flag.
 * Later slices extend this with preflight errors, live scaffold event
 * state, and the resulting project path. Closing the dialog resets the
 * form so reopening doesn't surface stale input.
 */
import { create } from 'zustand';

interface NewProjectState {
  isOpen: boolean;
  name: string;
  parentDir: string;
  open: () => void;
  close: () => void;
  setName: (name: string) => void;
  setParentDir: (path: string) => void;
}

const INITIAL_FORM = { name: '', parentDir: '' };

export const useNewProjectStore = create<NewProjectState>((set) => ({
  isOpen: false,
  ...INITIAL_FORM,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, ...INITIAL_FORM }),
  setName: (name) => set({ name }),
  setParentDir: (parentDir) => set({ parentDir }),
}));
