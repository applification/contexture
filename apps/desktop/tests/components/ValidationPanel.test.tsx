import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useOntologyStore } from '@renderer/store/ontology';
import { ValidationPanel } from '@renderer/components/validation/ValidationPanel';

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
