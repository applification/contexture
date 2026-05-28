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

  it('toggles expanded enum nodes and edge-label visibility', () => {
    render(<GraphControlsPanel onClose={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Show enum nodes' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Edge labels' })).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show enum nodes' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Edge labels' }));

    expect(useGraphLayoutStore.getState().graphLayout).toMatchObject({
      showEnums: true,
      showEdgeLabels: false,
    });
  });

  it('resets visibility controls to defaults', () => {
    vi.useFakeTimers();
    useGraphLayoutStore
      .getState()
      .setGraphLayout({ showEnums: false, showEdgeLabels: false, nodeSpacing: 240 });
    render(<GraphControlsPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    vi.runOnlyPendingTimers();

    expect(useGraphLayoutStore.getState().graphLayout).toEqual(DEFAULT_LAYOUT);
  });
});
