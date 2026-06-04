import { create } from 'zustand';

export type ConvexVersionStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'mismatch'
  | 'target_missing'
  | 'probe_failed';
export type ConvexAgentReadinessStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'not_ready'
  | 'probe_failed';

export interface ConvexAgentReadinessCheck {
  status: ConvexAgentReadinessStatus;
  message: string | null;
  command: string | null;
}

export interface ConvexVersionState {
  emitterVersion: string | null;
  targetVersion: string | null;
  targetPackagePath: string | null;
  status: ConvexVersionStatus;
  message: string | null;
  convexAiFiles: ConvexAgentReadinessCheck;
  contextureMcp: ConvexAgentReadinessCheck;
  refresh: (irPath: string | null) => Promise<void>;
  reset: () => void;
}

const idleAgentReadiness: ConvexAgentReadinessCheck = {
  status: 'idle',
  message: null,
  command: null,
};

export const useConvexVersionStore = create<ConvexVersionState>((set) => ({
  emitterVersion: null,
  targetVersion: null,
  targetPackagePath: null,
  status: 'idle',
  message: null,
  convexAiFiles: idleAgentReadiness,
  contextureMcp: idleAgentReadiness,
  reset: () =>
    set({
      emitterVersion: null,
      targetVersion: null,
      targetPackagePath: null,
      status: 'idle',
      message: null,
      convexAiFiles: idleAgentReadiness,
      contextureMcp: idleAgentReadiness,
    }),
  refresh: async (irPath) => {
    if (!irPath || !window.contexture?.convex) {
      useConvexVersionStore.getState().reset();
      return;
    }
    set({
      status: 'loading',
      message: null,
      convexAiFiles: { status: 'loading', message: null, command: null },
      contextureMcp: { status: 'loading', message: null, command: null },
    });
    try {
      const [info, agentReadiness] = await Promise.all([
        window.contexture.convex.versionInfo({ irPath }),
        window.contexture.convex.agentReadiness({ irPath }),
      ]);
      set({
        emitterVersion: info.emitterVersion,
        targetVersion: info.targetVersion,
        targetPackagePath: info.targetPackagePath,
        status: info.status,
        message: info.message,
        convexAiFiles: agentReadiness.convexAiFiles,
        contextureMcp: agentReadiness.contextureMcp,
      });
    } catch (err) {
      set({
        emitterVersion: null,
        targetVersion: null,
        targetPackagePath: null,
        status: 'probe_failed',
        message: err instanceof Error ? err.message : String(err),
        convexAiFiles: {
          status: 'probe_failed',
          message: err instanceof Error ? err.message : String(err),
          command: null,
        },
        contextureMcp: {
          status: 'probe_failed',
          message: err instanceof Error ? err.message : String(err),
          command: null,
        },
      });
    }
  },
}));
