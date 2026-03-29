import { ValidationPanel } from '@renderer/components/validation/ValidationPanel';
import { useOntologyStore } from '@renderer/store/ontology';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function resetStores() {
  useOntologyStore.getState().reset();
}

describe('ValidationPanel', () => {
  beforeEach(resetStores);
  afterEach(cleanup);

  it('shows no issues for empty ontology', () => {
    render(<ValidationPanel />);
    expect(screen.getByText('No validation issues')).toBeInTheDocument();
  });

  it('shows no issues for valid ontology', () => {
    useOntologyStore
      .getState()
      .addClass('http://ex/A', { label: 'A', subClassOf: [], disjointWith: [] });
    render(<ValidationPanel />);
    expect(screen.getByText('No validation issues')).toBeInTheDocument();
  });

  it('shows warning for class with no label', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    render(<ValidationPanel />);
    expect(screen.getByText(/1 warning/)).toBeInTheDocument();
  });

  it('shows error for missing subClassOf target', () => {
    useOntologyStore.getState().addClass('http://ex/A', { subClassOf: ['http://ex/Missing'] });
    render(<ValidationPanel />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
});
