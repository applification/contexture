/**
 * `useNewProjectStore` — drives the New Project dialog visibility.
 *
 * Deliberately thin in this slice: the dialog is a tracer that just
 * opens and closes. Subsequent slices grow the store to carry the form
 * state, preflight errors, live scaffold progress, and the resulting
 * project path — all driven off the scaffold IPC stream from #121.
 */
import { create } from 'zustand';

interface NewProjectState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useNewProjectStore = create<NewProjectState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
