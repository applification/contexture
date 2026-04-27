/**
 * `useNewProjectStore` — drives the New Project dialog.
 *
 * Holds:
 *   - form state (name, parentDir, apps, isOpen)
 *   - `phase` — where we are in the flow (form → running → done / failed)
 *   - `preflightError` — surfaced in-dialog when stage 0 fails
 *   - `stageStates` + `log` — the live progress UI while stages run
 *
 * Closing resets everything so reopening doesn't show stale state.
 */
import type { PreflightError } from '@renderer/model/preflight-error-copy';
import { create } from 'zustand';

export type AppKind = 'web' | 'mobile' | 'desktop';
export type NewProjectPhase = 'form' | 'running' | 'done' | 'failed';
export type StageStatus = 'pending' | 'running' | 'done' | 'failed';
export type StartingPoint = 'new' | 'promote';

export interface ScaffoldFailure {
  stage: number;
  stderr: string;
  retrySafe: boolean;
}

export type StageStates = Readonly<Record<number, StageStatus>>;

interface NewProjectState {
  isOpen: boolean;
  name: string;
  parentDir: string;
  apps: AppKind[];
  description: string;
  startingPoint: StartingPoint;
  scratchPath: string;
  scratchValidationError: string | null;
  phase: NewProjectPhase;
  preflightError: PreflightError | null;
  failure: ScaffoldFailure | null;
  stageStates: StageStates;
  log: string;
  open: () => void;
  close: () => void;
  setName: (name: string) => void;
  setParentDir: (path: string) => void;
  toggleApp: (app: AppKind) => void;
  setDescription: (desc: string) => void;
  setStartingPoint: (sp: StartingPoint) => void;
  setScratchPath: (path: string) => void;
  setScratchValidationError: (err: string | null) => void;
  setPreflightError: (err: PreflightError) => void;
  clearPreflightError: () => void;
  setPhase: (phase: NewProjectPhase) => void;
  setFailure: (failure: ScaffoldFailure) => void;
  markStage: (stage: number, status: StageStatus) => void;
  appendLog: (chunk: string) => void;
  resetProgress: () => void;
}

const INITIAL = {
  name: '',
  parentDir: '',
  apps: ['web'] as AppKind[],
  description: '',
  startingPoint: 'new' as StartingPoint,
  scratchPath: '',
  scratchValidationError: null as string | null,
  phase: 'form' as NewProjectPhase,
  preflightError: null as PreflightError | null,
  failure: null as ScaffoldFailure | null,
  stageStates: {} as StageStates,
  log: '',
};

export const useNewProjectStore = create<NewProjectState>((set) => ({
  isOpen: false,
  ...INITIAL,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, ...INITIAL }),
  setName: (name) => set({ name }),
  setParentDir: (parentDir) => set({ parentDir }),
  setDescription: (description) => set({ description }),
  setStartingPoint: (startingPoint) => set({ startingPoint }),
  setScratchPath: (scratchPath) => set({ scratchPath }),
  setScratchValidationError: (scratchValidationError) => set({ scratchValidationError }),
  toggleApp: (app) =>
    set((s) => ({
      apps: s.apps.includes(app) ? s.apps.filter((a) => a !== app) : [...s.apps, app],
    })),
  setPreflightError: (preflightError) => set({ preflightError, phase: 'form' }),
  clearPreflightError: () => set({ preflightError: null }),
  setPhase: (phase) => set({ phase }),
  setFailure: (failure) => set({ failure, phase: 'failed' }),
  markStage: (stage, status) =>
    set((s) => ({ stageStates: { ...s.stageStates, [stage]: status } })),
  appendLog: (chunk) => set((s) => ({ log: s.log + chunk })),
  resetProgress: () => set({ stageStates: {}, log: '', preflightError: null, failure: null }),
}));
