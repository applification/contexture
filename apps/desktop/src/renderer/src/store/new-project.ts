/**
 * `useNewProjectStore` — drives the New Project dialog.
 *
 * Holds:
 *   - form state (name, parentDir, isOpen)
 *   - `phase` — where we are in the flow (form → running → done / failed)
 *   - `preflightError` — surfaced in-dialog when stage 0 fails
 *   - `stageStates` + `log` — the live progress UI while stages run
 *
 * Closing resets everything so reopening doesn't show stale state.
 */
import type { PreflightError } from '@renderer/model/preflight-error-copy';
import { create } from 'zustand';

export type NewProjectPhase = 'form' | 'running' | 'done' | 'failed';
export type StageStatus = 'pending' | 'running' | 'done' | 'failed';
export type StartingPoint = 'describe' | 'promote';

const STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type StageStates = Readonly<Record<number, StageStatus>>;

function freshStageStates(): StageStates {
  const out: Record<number, StageStatus> = {};
  for (const n of STAGES) out[n] = 'pending';
  return out;
}

interface NewProjectState {
  isOpen: boolean;
  name: string;
  parentDir: string;
  startingPoint: StartingPoint | null;
  description: string;
  phase: NewProjectPhase;
  preflightError: PreflightError | null;
  stageStates: StageStates;
  log: string;
  open: () => void;
  close: () => void;
  setName: (name: string) => void;
  setParentDir: (path: string) => void;
  setStartingPoint: (point: StartingPoint) => void;
  setDescription: (desc: string) => void;
  setPreflightError: (err: PreflightError) => void;
  clearPreflightError: () => void;
  setPhase: (phase: NewProjectPhase) => void;
  markStage: (stage: number, status: StageStatus) => void;
  appendLog: (chunk: string) => void;
  resetProgress: () => void;
}

const INITIAL = {
  name: '',
  parentDir: '',
  startingPoint: null as StartingPoint | null,
  description: '',
  phase: 'form' as NewProjectPhase,
  preflightError: null as PreflightError | null,
  stageStates: freshStageStates(),
  log: '',
};

export const useNewProjectStore = create<NewProjectState>((set) => ({
  isOpen: false,
  ...INITIAL,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, ...INITIAL, stageStates: freshStageStates(), log: '' }),
  setName: (name) => set({ name }),
  setParentDir: (parentDir) => set({ parentDir }),
  setStartingPoint: (startingPoint) => set({ startingPoint }),
  setDescription: (description) => set({ description }),
  setPreflightError: (preflightError) => set({ preflightError, phase: 'form' }),
  clearPreflightError: () => set({ preflightError: null }),
  setPhase: (phase) => set({ phase }),
  markStage: (stage, status) =>
    set((s) => ({ stageStates: { ...s.stageStates, [stage]: status } })),
  appendLog: (chunk) => set((s) => ({ log: s.log + chunk })),
  resetProgress: () => set({ stageStates: freshStageStates(), log: '', preflightError: null }),
}));
