import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DetailPanel } from '@renderer/components/detail/DetailPanel';
import { useOntologyStore } from '@renderer/store/ontology';
import { useUIStore } from '@renderer/store/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const EX = 'http://example.org/expr#';

const classExpressionTurtle = readFileSync(
  resolve(__dirname, '../../resources/sample-ontologies/owl-class-expressions.ttl'),
  'utf-8',
);

function resetStores() {
  useUIStore.setState({ selectedNodeId: null, selectedEdgeId: null });
  useOntologyStore.getState().reset();
}

describe('ClassDetail — class expression rendering (ONT-83)', () => {
  beforeEach(() => {
    resetStores();
    useOntologyStore
      .getState()
      .loadFromTurtle(classExpressionTurtle, 'Sample: owl-class-expressions');
  });

  afterEach(cleanup);

  it('shows the Class Expressions section with operator badges', () => {
    useUIStore.setState({ selectedNodeId: `${EX}Nested` });

    render(<DetailPanel />);

    expect(screen.getByText('Class Expressions')).toBeInTheDocument();
    expect(screen.getByText('Logical definitions for this class')).toBeInTheDocument();
    expect(screen.getByText('OR')).toBeInTheDocument();
    expect(screen.getByText('AND')).toBeInTheDocument();
    expect(screen.getByText('NOT')).toBeInTheDocument();
  });

  it('focuses a target class when a class-expression class chip is clicked', () => {
    useUIStore.setState({ selectedNodeId: `${EX}A` });

    render(<DetailPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'B' }));

    expect(useUIStore.getState().selectedNodeId).toBe(`${EX}B`);
  });
});
