import { create } from 'zustand';

export type EvalModelId = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6';
export type EvalEffort = 'auto' | 'low' | 'med' | 'high';

export interface EvalDimension {
  name: string;
  score: number;
  findings: string[];
  suggestions: string[];
}

export interface EvalReport {
  score: number;
  dimensions: EvalDimension[];
  summary: string;
  timestamp: string;
}

export interface EvalConfig {
  domain: string;
  intendedUse: string;
  model: EvalModelId;
  effort: EvalEffort;
}

export interface ImprovementItem {
  text: string;
  status: 'pending' | 'active' | 'done';
}

interface EvalState {
  config: EvalConfig;
  status: 'idle' | 'running' | 'complete' | 'error';
  streamText: string;
  report: EvalReport | null;
  error: string | null;

  selectedSuggestions: string[];
  completedSuggestions: string[];
  improvementItems: ImprovementItem[];
  improvementStatus: 'idle' | 'running' | 'complete';

  setConfig: (patch: Partial<EvalConfig>) => void;
  startEval: () => void;
  setStreamText: (text: string) => void;
  setReport: (report: EvalReport) => void;
  setError: (error: string) => void;
  reset: () => void;

  toggleSuggestion: (text: string) => void;
  clearSelections: () => void;
  markSuggestionsComplete: (items: string[]) => void;
  startImprovements: (items: string[]) => void;
  markItemDone: (index: number) => void;
  finishImprovements: () => void;
  dismissImprovements: () => void;
}

export const useEvalStore = create<EvalState>((set) => ({
  config: {
    domain: '',
    intendedUse: '',
    model: 'claude-sonnet-4-6',
    effort: 'auto',
  },
  status: 'idle',
  streamText: '',
  report: null,
  error: null,

  selectedSuggestions: [],
  completedSuggestions: [],
  improvementItems: [],
  improvementStatus: 'idle',

  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  startEval: () => set({ status: 'running', streamText: '', report: null, error: null }),
  setStreamText: (text) => set({ streamText: text }),
  setReport: (report) => set({ status: 'complete', report }),
  setError: (error) => set({ status: 'error', error }),
  reset: () => set({ status: 'idle', streamText: '', report: null, error: null }),

  toggleSuggestion: (text) =>
    set((s) => ({
      selectedSuggestions: s.selectedSuggestions.includes(text)
        ? s.selectedSuggestions.filter((t) => t !== text)
        : [...s.selectedSuggestions, text],
    })),
  clearSelections: () => set({ selectedSuggestions: [] }),

  markSuggestionsComplete: (items) =>
    set((s) => ({
      completedSuggestions: [...new Set([...s.completedSuggestions, ...items])],
    })),

  startImprovements: (items) =>
    set({
      improvementItems: items.map((text, i) => ({
        text,
        status: i === 0 ? 'active' : 'pending',
      })),
      improvementStatus: 'running',
    }),

  markItemDone: (index) =>
    set((s) => ({
      improvementItems: s.improvementItems.map((item, i) => {
        if (i === index) return { ...item, status: 'done' };
        if (i === index + 1) return { ...item, status: 'active' };
        return item;
      }),
    })),

  finishImprovements: () =>
    set((s) => ({
      improvementStatus: 'complete',
      improvementItems: s.improvementItems.map((item) =>
        item.status !== 'done' ? { ...item, status: 'done' } : item,
      ),
    })),

  dismissImprovements: () => set({ improvementStatus: 'idle', improvementItems: [] }),
}));
