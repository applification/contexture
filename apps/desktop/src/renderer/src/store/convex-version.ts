import { create } from 'zustand';

export type ConvexVersionStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'mismatch'
  | 'target_missing'
  | 'probe_failed';

export interface ConvexVersionState {
  emitterVersion: string | null;
  targetVersion: string | null;
  targetPackagePath: string | null;
  status: ConvexVersionStatus;
  message: string | null;
  refresh: (irPath: string | null) => Promise<void>;
  reset: () => void;
}

export const useConvexVersionStore = create<ConvexVersionState>((set) => ({
  emitterVersion: null,
  targetVersion: null,
  targetPackagePath: null,
  status: 'idle',
  message: null,
  reset: () =>
    set({
      emitterVersion: null,
      targetVersion: null,
      targetPackagePath: null,
      status: 'idle',
      message: null,
    }),
  refresh: async (irPath) => {
    if (!irPath || !window.contexture?.convex) {
      useConvexVersionStore.getState().reset();
      return;
    }
    set({ status: 'loading', message: null });
    try {
      const info = await window.contexture.convex.versionInfo({ irPath });
      set({
        emitterVersion: info.emitterVersion,
        targetVersion: info.targetVersion,
        targetPackagePath: info.targetPackagePath,
        status: info.status,
        message: info.message,
      });
    } catch (err) {
      set({
        emitterVersion: null,
        targetVersion: null,
        targetPackagePath: null,
        status: 'probe_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
