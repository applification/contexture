import { EvolutionPolicyPanel } from '@renderer/components/graph/EvolutionPolicyPanel';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('EvolutionPolicyPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('summarizes the active policy while collapsed', () => {
    render(<EvolutionPolicyPanel policy="scratch" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Expand evolution policy' })).toHaveAttribute(
      'title',
      'Evolution policy: Scratch',
    );
    expect(
      screen.queryByRole('group', { name: 'Evolution policy options' }),
    ).not.toBeInTheDocument();
  });

  it('explains the policy options when expanded', () => {
    render(<EvolutionPolicyPanel policy="preserveData" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand evolution policy' }));

    expect(screen.getByText('Current posture')).toBeInTheDocument();
    expect(screen.getByText('Preserve data')).toBeInTheDocument();
    expect(screen.getByText('Resettable')).toBeInTheDocument();
    expect(screen.getByText('Scratch')).toBeInTheDocument();
    expect(screen.getByText(/migration-aware changes/i)).toBeInTheDocument();
    expect(screen.getByText(/breaking remodels/i)).toBeInTheDocument();
    expect(screen.getByText(/freely rename/i)).toBeInTheDocument();
  });

  it('applies a selected policy', () => {
    const onChange = vi.fn();
    render(<EvolutionPolicyPanel policy="preserveData" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand evolution policy' }));
    const options = screen.getByRole('group', { name: 'Evolution policy options' });
    fireEvent.click(within(options).getByRole('button', { name: /scratch/i }));

    expect(onChange).toHaveBeenCalledWith('scratch');
  });
});
