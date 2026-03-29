import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useEvalStore } from '@renderer/store/eval';
import { ImprovementHUD } from '@renderer/components/hud/ImprovementHUD';

function resetStore() {
  useEvalStore.setState({
    improvementItems: [],
    improvementStatus: 'idle',
  });
}

describe('ImprovementHUD', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('returns null when idle', () => {
    const { container } = render(<ImprovementHUD />);
    expect(container.innerHTML).toBe('');
  });

  it('renders header when running', () => {
    useEvalStore.setState({
      improvementStatus: 'running',
      improvementItems: [
        { text: 'Add coverage classes', status: 'active' },
        { text: 'Fix naming', status: 'pending' },
      ],
    });
    render(<ImprovementHUD />);
    expect(screen.getByText('Improvements')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('renders improvement items', () => {
    useEvalStore.setState({
      improvementStatus: 'running',
      improvementItems: [
        { text: 'Add coverage classes', status: 'active' },
        { text: 'Fix naming', status: 'pending' },
      ],
    });
    render(<ImprovementHUD />);
    expect(screen.getByText('Add coverage classes')).toBeInTheDocument();
    expect(screen.getByText('Fix naming')).toBeInTheDocument();
  });

  it('shows done count', () => {
    useEvalStore.setState({
      improvementStatus: 'running',
      improvementItems: [
        { text: 'Add coverage classes', status: 'done' },
        { text: 'Fix naming', status: 'active' },
      ],
    });
    render(<ImprovementHUD />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('shows completion message when complete', () => {
    useEvalStore.setState({
      improvementStatus: 'complete',
      improvementItems: [{ text: 'Done item', status: 'done' }],
    });
    render(<ImprovementHUD />);
    expect(screen.getByText('All improvements applied')).toBeInTheDocument();
  });

  it('shows dismiss button when complete', () => {
    useEvalStore.setState({
      improvementStatus: 'complete',
      improvementItems: [{ text: 'Done', status: 'done' }],
    });
    render(<ImprovementHUD />);
    // X dismiss button should be rendered somewhere in the component
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
