import { GraphControlsPanel } from '@renderer/components/toolbar/GraphControlsPanel';
import { DEFAULT_LAYOUT, useGraphLayoutStore } from '@renderer/store/layout-config';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('GraphControlsPanel', () => {
  beforeEach(() => {
    useGraphLayoutStore.getState().resetToDefaults();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('toggles expanded enum nodes, stdlib nodes, and edge-label visibility', () => {
    render(<GraphControlsPanel onClose={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Show enum nodes' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Show stdlib nodes' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Edge labels' })).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show enum nodes' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show stdlib nodes' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Edge labels' }));

    expect(useGraphLayoutStore.getState().graphLayout).toMatchObject({
      showEnums: true,
      showStdlib: true,
      showEdgeLabels: false,
    });
  });

  it('resets visibility controls to defaults', () => {
    vi.useFakeTimers();
    useGraphLayoutStore.getState().setGraphLayout({
      layoutMode: 'organic',
      showEnums: false,
      showStdlib: true,
      showEdgeLabels: false,
      nodeSpacing: 240,
    });
    render(<GraphControlsPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    vi.runOnlyPendingTimers();

    expect(useGraphLayoutStore.getState().graphLayout).toEqual(DEFAULT_LAYOUT);
  });

  it('switches layout mode and requests a re-layout', () => {
    vi.useFakeTimers();
    const relayoutListener = vi.fn();
    document.addEventListener('graph:relayout', relayoutListener);
    render(<GraphControlsPanel onClose={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Layered' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Organic' }));
    vi.runOnlyPendingTimers();

    expect(useGraphLayoutStore.getState().graphLayout.layoutMode).toBe('organic');
    expect(screen.getByRole('radio', { name: 'Organic' })).toBeChecked();
    expect(relayoutListener).toHaveBeenCalledTimes(1);

    document.removeEventListener('graph:relayout', relayoutListener);
  });
});
