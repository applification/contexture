import type { EvalReport } from '@renderer/store/eval';
import { useEvalStore } from '@renderer/store/eval';
import { beforeEach, describe, expect, it } from 'vitest';

function resetStore() {
  useEvalStore.setState({
    config: { domain: '', intendedUse: '', model: 'claude-sonnet-4-6', effort: 'auto' },
    status: 'idle',
    streamText: '',
    report: null,
    error: null,
    selectedSuggestions: [],
    completedSuggestions: [],
    improvementItems: [],
    improvementStatus: 'idle',
  });
}

const SAMPLE_REPORT: EvalReport = {
  score: 85,
  dimensions: [
    { name: 'Coverage', score: 90, findings: ['Good coverage'], suggestions: ['Add more classes'] },
  ],
  summary: 'Good ontology',
  timestamp: '2026-01-01T00:00:00Z',
};

describe('useEvalStore', () => {
  beforeEach(resetStore);

  it('sets config partially', () => {
    useEvalStore.getState().setConfig({ domain: 'Healthcare' });
    expect(useEvalStore.getState().config.domain).toBe('Healthcare');
    expect(useEvalStore.getState().config.model).toBe('claude-sonnet-4-6'); // unchanged
  });

  it('starts eval', () => {
    useEvalStore.getState().startEval();
    const state = useEvalStore.getState();
    expect(state.status).toBe('running');
    expect(state.streamText).toBe('');
    expect(state.report).toBeNull();
    expect(state.error).toBeNull();
  });

  it('sets stream text', () => {
    useEvalStore.getState().setStreamText('Analyzing...');
    expect(useEvalStore.getState().streamText).toBe('Analyzing...');
  });

  it('sets report', () => {
    useEvalStore.getState().setReport(SAMPLE_REPORT);
    expect(useEvalStore.getState().status).toBe('complete');
    expect(useEvalStore.getState().report).toEqual(SAMPLE_REPORT);
  });

  it('sets error', () => {
    useEvalStore.getState().setError('Failed');
    expect(useEvalStore.getState().status).toBe('error');
    expect(useEvalStore.getState().error).toBe('Failed');
  });

  it('resets', () => {
    useEvalStore.getState().startEval();
    useEvalStore.getState().setStreamText('data');
    useEvalStore.getState().reset();
    expect(useEvalStore.getState().status).toBe('idle');
    expect(useEvalStore.getState().streamText).toBe('');
  });

  describe('suggestion selection', () => {
    it('toggles suggestion on', () => {
      useEvalStore.getState().toggleSuggestion('Add classes');
      expect(useEvalStore.getState().selectedSuggestions).toContain('Add classes');
    });

    it('toggles suggestion off', () => {
      useEvalStore.getState().toggleSuggestion('Add classes');
      useEvalStore.getState().toggleSuggestion('Add classes');
      expect(useEvalStore.getState().selectedSuggestions).not.toContain('Add classes');
    });

    it('clears selections', () => {
      useEvalStore.getState().toggleSuggestion('A');
      useEvalStore.getState().toggleSuggestion('B');
      useEvalStore.getState().clearSelections();
      expect(useEvalStore.getState().selectedSuggestions).toEqual([]);
    });
  });

  describe('completed suggestions', () => {
    it('marks suggestions complete', () => {
      useEvalStore.getState().markSuggestionsComplete(['A', 'B']);
      expect(useEvalStore.getState().completedSuggestions).toEqual(['A', 'B']);
    });

    it('deduplicates completed suggestions', () => {
      useEvalStore.getState().markSuggestionsComplete(['A', 'B']);
      useEvalStore.getState().markSuggestionsComplete(['B', 'C']);
      expect(useEvalStore.getState().completedSuggestions).toEqual(['A', 'B', 'C']);
    });
  });

  describe('improvements', () => {
    it('starts improvements with first active', () => {
      useEvalStore.getState().startImprovements(['Fix A', 'Fix B', 'Fix C']);
      const { improvementItems, improvementStatus } = useEvalStore.getState();
      expect(improvementStatus).toBe('running');
      expect(improvementItems[0].status).toBe('active');
      expect(improvementItems[1].status).toBe('pending');
      expect(improvementItems[2].status).toBe('pending');
    });

    it('marks item done and activates next', () => {
      useEvalStore.getState().startImprovements(['Fix A', 'Fix B', 'Fix C']);
      useEvalStore.getState().markItemDone(0);
      const items = useEvalStore.getState().improvementItems;
      expect(items[0].status).toBe('done');
      expect(items[1].status).toBe('active');
      expect(items[2].status).toBe('pending');
    });

    it('finishes all improvements', () => {
      useEvalStore.getState().startImprovements(['Fix A', 'Fix B']);
      useEvalStore.getState().finishImprovements();
      const { improvementItems, improvementStatus } = useEvalStore.getState();
      expect(improvementStatus).toBe('complete');
      expect(improvementItems.every((i) => i.status === 'done')).toBe(true);
    });

    it('dismisses improvements', () => {
      useEvalStore.getState().startImprovements(['Fix A']);
      useEvalStore.getState().dismissImprovements();
      expect(useEvalStore.getState().improvementStatus).toBe('idle');
      expect(useEvalStore.getState().improvementItems).toEqual([]);
    });
  });
});
