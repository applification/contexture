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
});
