import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DriftBanner } from '../../src/renderer/src/components/hud/DriftBanner';
import { useDriftStore } from '../../src/renderer/src/store/drift';
import { useReconcileStore } from '../../src/renderer/src/store/reconcile';

afterEach(() => {
  cleanup();
  useDriftStore.getState().setResolved();
  useReconcileStore.getState().reset();
});

describe('DriftBanner', () => {
  it('is hidden when there are no generated-file problems', () => {
    render(<DriftBanner />);

    expect(screen.queryByTestId('drift-banner')).not.toBeInTheDocument();
  });

  it('shows drifted generated files as modified outside Contexture', () => {
    useDriftStore
      .getState()
      .setDetected([{ path: '/repo/packages/contexture/garden.schema.ts', status: 'drifted' }]);

    render(<DriftBanner />);

    expect(screen.getByTestId('drift-banner')).toHaveTextContent(
      'garden.schema.ts was modified outside Contexture.',
    );
  });

  it('shows unreadable generated files as missing or unreadable', () => {
    useDriftStore
      .getState()
      .setDetected([
        { path: '/repo/packages/contexture/garden.schema.json', status: 'unreadable' },
      ]);

    render(<DriftBanner />);

    expect(screen.getByTestId('drift-banner')).toHaveTextContent(
      'garden.schema.json is missing or unreadable.',
    );
  });

  it('reviews a drifted file before an unreadable file', () => {
    useDriftStore.getState().setDetected([
      { path: '/repo/packages/contexture/garden.schema.json', status: 'unreadable' },
      { path: '/repo/packages/contexture/garden.schema.ts', status: 'drifted' },
    ]);

    render(<DriftBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    expect(useReconcileStore.getState().targetPath).toBe(
      '/repo/packages/contexture/garden.schema.ts',
    );
  });
});
