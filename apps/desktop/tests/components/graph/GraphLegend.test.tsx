import { GraphLegend } from '@renderer/components/graph/GraphLegend';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

describe('GraphLegend', () => {
  afterEach(() => cleanup());

  it('documents the table node rail in the expanded node legend', () => {
    render(<GraphLegend />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand legend' }));

    expect(screen.getByText('Table')).toBeInTheDocument();
  });

  it('documents inline enums by default and only shows enum nodes when expanded in controls', () => {
    const { rerender } = render(<GraphLegend />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand legend' }));

    expect(screen.getByText('Inline enum')).toBeInTheDocument();
    expect(screen.queryByText('Enum')).not.toBeInTheDocument();

    rerender(<GraphLegend showEnumNodes />);

    expect(screen.getByText('Enum')).toBeInTheDocument();
  });
});
