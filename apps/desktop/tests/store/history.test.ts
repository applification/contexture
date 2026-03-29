import { describe, it, expect, beforeEach } from 'vitest';
import { useHistoryStore } from '@renderer/store/history';
import { useOntologyStore } from '@renderer/store/ontology';

function resetStores() {
  useOntologyStore.getState().reset();
  useHistoryStore.setState({ past: [], canUndo: false });
}

describe('useHistoryStore', () => {
  beforeEach(resetStores);

  it('starts with empty history', () => {
    expect(useHistoryStore.getState().past).toEqual([]);
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('records snapshot on ontology mutation', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    expect(useHistoryStore.getState().canUndo).toBe(true);
    expect(useHistoryStore.getState().past.length).toBe(1);
  });

  it('undo restores previous state', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    useOntologyStore.getState().addClass('http://ex/B');
    expect(useOntologyStore.getState().ontology.classes.size).toBe(2);

    useHistoryStore.getState().undo();
    // After undo, should have state from before adding B
    expect(useOntologyStore.getState().ontology.classes.has('http://ex/A')).toBe(true);
    expect(useOntologyStore.getState().ontology.classes.has('http://ex/B')).toBe(false);
  });

  it('clears history on file load', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    expect(useHistoryStore.getState().canUndo).toBe(true);

    useOntologyStore.getState().loadFromTurtle('');
    expect(useHistoryStore.getState().past).toEqual([]);
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('clears history on reset', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    useOntologyStore.getState().reset();
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('does nothing on undo with empty history', () => {
    const before = useOntologyStore.getState().ontology;
    useHistoryStore.getState().undo();
    expect(useOntologyStore.getState().ontology).toBe(before);
  });
});
