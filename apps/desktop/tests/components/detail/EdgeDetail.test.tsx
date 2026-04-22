/**
 * EdgeDetail — read-only ref-edge metadata + optional "edit field" jump.
 */
import { EdgeDetail } from '@renderer/components/detail/EdgeDetail';
import type { RefEdgeData } from '@renderer/components/graph/schema-to-graph';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('EdgeDetail', () => {
  afterEach(cleanup);

  it('renders source type, source field, and target type', () => {
    const data: RefEdgeData = {
      sourceType: 'Plot',
      sourceField: 'harvest',
      targetType: 'Harvest',
      crossBoundary: false,
    };
    render(<EdgeDetail data={data} />);
    expect(screen.getByText('Plot')).toBeInTheDocument();
    expect(screen.getByText('harvest')).toBeInTheDocument();
    expect(screen.getByText('Harvest')).toBeInTheDocument();
    expect(screen.queryByText(/cross-boundary/)).not.toBeInTheDocument();
  });

  it('badges cross-boundary edges', () => {
    const data: RefEdgeData = {
      sourceType: 'User',
      sourceField: 'email',
      targetType: 'common.Email',
      crossBoundary: true,
    };
    render(<EdgeDetail data={data} />);
    expect(screen.getByText(/cross-boundary/)).toBeInTheDocument();
  });

  it('invokes onEditField with source when the affordance is clicked', () => {
    const data: RefEdgeData = {
      sourceType: 'Plot',
      sourceField: 'harvest',
      targetType: 'Harvest',
      crossBoundary: false,
    };
    const onEditField = vi.fn();
    render(<EdgeDetail data={data} onEditField={onEditField} />);
    fireEvent.click(screen.getByText('Edit field'));
    expect(onEditField).toHaveBeenCalledWith('Plot', 'harvest');
  });
});
