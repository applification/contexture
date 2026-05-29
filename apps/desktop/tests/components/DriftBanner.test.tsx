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

  it('shows stale generated files as needing re-emit from the current IR', () => {
    useDriftStore
      .getState()
      .setDetected([{ path: '/repo/packages/contexture/convex/schema.ts', status: 'stale' }]);

    render(<DriftBanner />);

    expect(screen.getByTestId('drift-banner')).toHaveTextContent(
      'schema.ts is stale and needs re-emitting from the current IR.',
    );
  });

  it('shows externally regenerated files as manifest-out-of-date', () => {
    useDriftStore.getState().setDetected([
      {
        path: '/repo/packages/contexture/convex/schema.ts',
        status: 'externally_regenerated',
      },
    ]);

    render(<DriftBanner />);

    expect(screen.getByTestId('drift-banner')).toHaveTextContent(
      'schema.ts matches the current IR, but the manifest is out of date.',
    );
  });

  it('reviews a readable file before an unreadable file', () => {
    useDriftStore.getState().setDetected([
      { path: '/repo/packages/contexture/garden.schema.json', status: 'unreadable' },
      { path: '/repo/packages/contexture/garden.schema.ts', status: 'stale' },
    ]);

    render(<DriftBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    expect(useReconcileStore.getState().targetPath).toBe(
      '/repo/packages/contexture/garden.schema.ts',
    );
  });
});
