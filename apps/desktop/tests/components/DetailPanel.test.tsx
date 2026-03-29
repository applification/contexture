import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useUIStore } from '@renderer/store/ui';
import { useOntologyStore } from '@renderer/store/ontology';
import { DetailPanel } from '@renderer/components/detail/DetailPanel';

function resetStores() {
  useUIStore.setState({ selectedNodeId: null, selectedEdgeId: null });
  useOntologyStore.getState().reset();
}

describe('DetailPanel', () => {
  beforeEach(resetStores);
  afterEach(cleanup);

  it('renders null when nothing selected', () => {
    const { container } = render(<DetailPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders ClassDetail when node selected', () => {
    useOntologyStore.getState().addClass('http://ex/Person', { label: 'Person' });
    useUIStore.setState({ selectedNodeId: 'http://ex/Person' });

    render(<DetailPanel />);
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('Class')).toBeInTheDocument();
  });

  it('renders EdgeDetail when object property edge selected', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    useOntologyStore.getState().addClass('http://ex/B');
    useOntologyStore.getState().addObjectProperty('http://ex/rel', {
      label: 'relates',
      domain: ['http://ex/A'],
      range: ['http://ex/B'],
    });
    useUIStore.setState({ selectedEdgeId: 'objprop-http://ex/rel-http://ex/A-http://ex/B' });

    render(<DetailPanel />);
    expect(screen.getByText('Object Property')).toBeInTheDocument();
    expect(screen.getByText('rel')).toBeInTheDocument();
  });

  it('renders subClassOf info for subclass edges', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    useOntologyStore.getState().addClass('http://ex/B', { subClassOf: ['http://ex/A'] });
    useUIStore.setState({ selectedEdgeId: 'subclass-http://ex/B-http://ex/A' });

    render(<DetailPanel />);
    expect(screen.getByText('rdfs:subClassOf')).toBeInTheDocument();
    expect(screen.getByText('Inheritance relationship')).toBeInTheDocument();
  });

  it('renders null for unknown edge type', () => {
    useUIStore.setState({ selectedEdgeId: 'unknown-edge-id' });
    const { container } = render(<DetailPanel />);
    expect(container.innerHTML).toBe('');
  });
});
