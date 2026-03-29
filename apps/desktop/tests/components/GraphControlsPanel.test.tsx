import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useUIStore } from '@renderer/store/ui';
import { GraphControlsPanel } from '@renderer/components/toolbar/GraphControlsPanel';

function resetStore() {
  useUIStore.getState().resetGraphControls();
}

describe('GraphControlsPanel', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders header', () => {
    render(<GraphControlsPanel onClose={() => {}} />);
    expect(screen.getByText('Graph Controls')).toBeInTheDocument();
  });

  it('renders visibility section', () => {
    render(<GraphControlsPanel onClose={() => {}} />);
    expect(screen.getByText('Visibility')).toBeInTheDocument();
    expect(screen.getByText('Object properties')).toBeInTheDocument();
    expect(screen.getByText('Subclass edges')).toBeInTheDocument();
    expect(screen.getByText('Disjoint edges')).toBeInTheDocument();
    expect(screen.getByText('Datatype properties')).toBeInTheDocument();
  });

  it('renders layout section', () => {
    render(<GraphControlsPanel onClose={() => {}} />);
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByText('Spacing')).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    render(<GraphControlsPanel onClose={() => {}} />);
    expect(screen.getByText('Fit to screen')).toBeInTheDocument();
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('calls onClose when X clicked', () => {
    const onClose = vi.fn();
    render(<GraphControlsPanel onClose={onClose} />);
    // Find the close button (it's the first icon button in the header)
    const closeBtn = screen.getByText('Graph Controls').parentElement!.querySelector('button')!;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('dispatches graph:relayout on Reset', () => {
    const spy = vi.fn();
    document.addEventListener('graph:relayout', spy);
    render(<GraphControlsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText('Reset'));
    // resetGraphControls is called synchronously; relayout is in setTimeout
    setTimeout(() => {
      expect(spy).toHaveBeenCalled();
      document.removeEventListener('graph:relayout', spy);
    }, 10);
  });

  it('shows min degree slider value', () => {
    render(<GraphControlsPanel onClose={() => {}} />);
    expect(screen.getByText('Min connections')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
