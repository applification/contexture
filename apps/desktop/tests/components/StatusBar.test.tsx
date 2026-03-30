import { StatusBar } from '@renderer/components/status-bar/StatusBar';
import { useOntologyStore } from '@renderer/store/ontology';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function resetStores() {
  useOntologyStore.getState().reset();
}

describe('StatusBar', () => {
  beforeEach(resetStores);
  afterEach(cleanup);

  it('shows "Saved" when no unsaved changes', () => {
    render(<StatusBar />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows file path when file loaded', () => {
    useOntologyStore.getState().loadFromTurtle('', '/path/to/ontology.ttl');
    render(<StatusBar />);
    expect(screen.getByText('/path/to/ontology.ttl')).toBeInTheDocument();
  });

  it('shows unsaved changes indicator when dirty', () => {
    useOntologyStore.getState().loadFromTurtle('', '/test.ttl');
    useOntologyStore.getState().addClass('http://ex/A');
    render(<StatusBar />);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('shows class and property counts', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    useOntologyStore.getState().addClass('http://ex/B');
    useOntologyStore.getState().addObjectProperty('http://ex/rel');
    render(<StatusBar />);
    expect(screen.getByText(/2 classes/)).toBeInTheDocument();
    expect(screen.getByText(/1 properties/)).toBeInTheDocument();
  });

  it('shows token count', () => {
    useOntologyStore.getState().addClass('http://ex/A');
    render(<StatusBar />);
    expect(screen.getByText(/tokens/)).toBeInTheDocument();
  });

  it('shows zero state counts', () => {
    render(<StatusBar />);
    expect(screen.getByText(/0 classes/)).toBeInTheDocument();
    expect(screen.getByText(/0 tokens/)).toBeInTheDocument();
  });

  it('shows Turtle format badge for .ttl files', () => {
    useOntologyStore.getState().loadFromTurtle('', '/path/to/ontology.ttl');
    render(<StatusBar />);
    expect(screen.getByText('Turtle')).toBeInTheDocument();
  });

  it('shows RDF/XML format badge for .rdf files', () => {
    useOntologyStore.setState({ filePath: '/path/to/ontology.rdf' });
    render(<StatusBar />);
    expect(screen.getByText('RDF/XML')).toBeInTheDocument();
  });

  it('shows RDF/XML format badge for .owl files', () => {
    useOntologyStore.setState({ filePath: '/path/to/ontology.owl' });
    render(<StatusBar />);
    expect(screen.getByText('RDF/XML')).toBeInTheDocument();
  });
});
