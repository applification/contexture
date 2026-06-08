import { GraphLegend } from '@renderer/components/graph/GraphLegend';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

describe('GraphLegend', () => {
  afterEach(() => cleanup());

  it('documents the table node rail in the expanded node legend', () => {
    render(<GraphLegend />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand legend' }));

    expect(screen.getAllByText('table')[0]).toBeInTheDocument();
  });

  it('documents quiet field refs and active paths separately', () => {
    render(<GraphLegend />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand legend' }));

    expect(screen.getByText('Field ref')).toBeInTheDocument();
    expect(screen.getByText('Active path')).toBeInTheDocument();
  });

  it('documents enum nodes and inline enums by default', () => {
    render(<GraphLegend />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand legend' }));

    expect(screen.getByText('Inline enum')).toBeInTheDocument();
    expect(screen.getAllByText('enum')[0]).toBeInTheDocument();
  });

  it('omits raw and imported cues when the visible graph does not use them', () => {
    render(<GraphLegend />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand legend' }));

    expect(screen.queryByText('raw')).not.toBeInTheDocument();
    expect(screen.queryByText('Imported')).not.toBeInTheDocument();
  });

  it('documents raw and imported cues when the visible graph uses them', () => {
    render(<GraphLegend showRawTypes showImportedNodes />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand legend' }));

    expect(screen.getByText('raw')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
  });
});
