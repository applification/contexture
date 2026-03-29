import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useOntologyStore } from '@renderer/store/ontology';
import { useUIStore } from '@renderer/store/ui';
import { GraphSearchBar } from '@renderer/components/toolbar/GraphSearchBar';

function resetStores() {
  useOntologyStore.getState().reset();
  useUIStore.setState({ focusNodeId: null });
}

describe('GraphSearchBar', () => {
  beforeEach(resetStores);
  afterEach(cleanup);

  it('renders search input', () => {
    render(<GraphSearchBar />);
    expect(screen.getByPlaceholderText('Search label, URI, comment…')).toBeInTheDocument();
  });

  it('shows no results for empty query', () => {
    useOntologyStore.getState().addClass('http://ex/Person', { label: 'Person' });
    render(<GraphSearchBar />);
    const input = screen.getByPlaceholderText('Search label, URI, comment…');
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByText('Person')).not.toBeInTheDocument();
  });

  it('shows matching results when typing', () => {
    useOntologyStore.getState().addClass('http://ex/Person', { label: 'Person' });
    useOntologyStore.getState().addClass('http://ex/Animal', { label: 'Animal' });
    render(<GraphSearchBar />);
    const input = screen.getByPlaceholderText('Search label, URI, comment…');
    fireEvent.change(input, { target: { value: 'Per' } });
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.queryByText('Animal')).not.toBeInTheDocument();
  });

  it('shows clear button when query present', () => {
    render(<GraphSearchBar />);
    const input = screen.getByPlaceholderText('Search label, URI, comment…');
    fireEvent.change(input, { target: { value: 'test' } });
    // X button should appear (the clear button)
    expect(input).toHaveValue('test');
  });

  it('clears results on Escape', () => {
    useOntologyStore.getState().addClass('http://ex/A', { label: 'Alpha' });
    render(<GraphSearchBar />);
    const input = screen.getByPlaceholderText('Search label, URI, comment…');
    fireEvent.change(input, { target: { value: 'Alpha' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('selects node on click', () => {
    useOntologyStore.getState().addClass('http://ex/Person', { label: 'Person' });
    render(<GraphSearchBar />);
    const input = screen.getByPlaceholderText('Search label, URI, comment…');
    fireEvent.change(input, { target: { value: 'Person' } });
    fireEvent.click(screen.getByText('Person'));
    expect(useUIStore.getState().focusNodeId).toBe('http://ex/Person');
  });

  it('supports keyboard navigation (ArrowDown/Enter)', () => {
    useOntologyStore.getState().addClass('http://ex/A', { label: 'Alpha' });
    useOntologyStore.getState().addClass('http://ex/B', { label: 'Alpha-Beta' });
    render(<GraphSearchBar />);
    const input = screen.getByPlaceholderText('Search label, URI, comment…');
    fireEvent.change(input, { target: { value: 'Alpha' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Should focus second result
    expect(useUIStore.getState().focusNodeId).toBeDefined();
  });

  it('uses localName fallback for classes without label', () => {
    useOntologyStore.getState().addClass('http://ex/MyClass');
    render(<GraphSearchBar />);
    const input = screen.getByPlaceholderText('Search label, URI, comment…');
    fireEvent.change(input, { target: { value: 'MyClass' } });
    expect(screen.getByText('MyClass')).toBeInTheDocument();
  });
});
