import { useUIStore } from '@renderer/store/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @xyflow/react — component uses BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode
vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ id }: { id: string }) => <path data-testid={`base-edge-${id}`} />,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getBezierPath: () => ['M0 0', 50, 50],
  useInternalNode: vi.fn(() => ({
    internals: {
      positionAbsolute: { x: 0, y: 0 },
      handleBounds: { source: [], target: [] },
    },
    measured: { width: 100, height: 40 },
  })),
  Position: { Left: 'left', Top: 'top', Right: 'right', Bottom: 'bottom' },
}));

const { ObjectPropertyEdge } = await import('@renderer/components/graph/edges/ObjectPropertyEdge');

const EDGE_BASE = {
  id: 'test-edge',
  source: 'node-a',
  target: 'node-b',
  selected: false,
  type: 'objectProperty',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 0,
  sourcePosition: 'right' as const,
  targetPosition: 'left' as const,
};

function resetStore() {
  useUIStore.setState({ selectedNodeId: null, adjacentEdgeIds: [] });
}

describe('ObjectPropertyEdge — characteristic badge row', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  describe('no characteristics', () => {
    it('renders without badge row when characteristics is empty', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'knows', uri: 'http://ex/knows', characteristics: [] }}
        />,
      );
      expect(screen.queryByText('T')).not.toBeInTheDocument();
      expect(screen.queryByText('S')).not.toBeInTheDocument();
      expect(screen.queryByText('R')).not.toBeInTheDocument();
      expect(screen.queryByText('F')).not.toBeInTheDocument();
      expect(screen.queryByText('IF')).not.toBeInTheDocument();
    });

    it('renders without badge row when characteristics is undefined (backwards compat)', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'knows', uri: 'http://ex/knows' } as never}
        />,
      );
      expect(screen.queryByText('T')).not.toBeInTheDocument();
    });
  });

  describe('single characteristic abbreviations', () => {
    it('renders T badge for transitive', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['transitive'] }}
        />,
      );
      expect(screen.getByText('T')).toBeInTheDocument();
    });

    it('renders S badge for symmetric', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['symmetric'] }}
        />,
      );
      expect(screen.getByText('S')).toBeInTheDocument();
    });

    it('renders R badge for reflexive', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['reflexive'] }}
        />,
      );
      expect(screen.getByText('R')).toBeInTheDocument();
    });

    it('renders F badge for functional', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['functional'] }}
        />,
      );
      expect(screen.getByText('F')).toBeInTheDocument();
    });

    it('renders IF badge for inverseFunctional', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['inverseFunctional'] }}
        />,
      );
      expect(screen.getByText('IF')).toBeInTheDocument();
    });
  });

  describe('multiple characteristics', () => {
    it('renders all five abbreviation badges', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{
            label: 'p',
            uri: 'http://ex/p',
            characteristics: [
              'transitive',
              'symmetric',
              'reflexive',
              'functional',
              'inverseFunctional',
            ],
          }}
        />,
      );
      expect(screen.getByText('T')).toBeInTheDocument();
      expect(screen.getByText('S')).toBeInTheDocument();
      expect(screen.getByText('R')).toBeInTheDocument();
      expect(screen.getByText('F')).toBeInTheDocument();
      expect(screen.getByText('IF')).toBeInTheDocument();
    });

    it('renders exactly one badge per characteristic — no duplicates', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['transitive', 'transitive'] }}
        />,
      );
      // Should deduplicate or only render once per unique characteristic
      expect(screen.getAllByText('T')).toHaveLength(1);
    });
  });

  describe('tooltip on badges', () => {
    it('T badge has title "Transitive"', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['transitive'] }}
        />,
      );
      const badge = screen.getByText('T');
      expect(badge.closest('[title]')?.getAttribute('title')).toBe('Transitive');
    });

    it('IF badge has title "Inverse Functional"', () => {
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['inverseFunctional'] }}
        />,
      );
      const badge = screen.getByText('IF');
      expect(badge.closest('[title]')?.getAttribute('title')).toBe('Inverse Functional');
    });
  });

  describe('dimming behavior', () => {
    it('badge row container has same opacity as edge when not dimmed', () => {
      useUIStore.setState({ selectedNodeId: null, adjacentEdgeIds: [] });
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['transitive'] }}
        />,
      );
      const tBadge = screen.getByText('T');
      // The badge row should not have opacity: 0.15 when not dimmed
      const badgeRow = tBadge.closest('div');
      const style = badgeRow?.style?.opacity;
      expect(style).not.toBe('0.15');
    });

    it('badge row dims when a different node is selected', () => {
      useUIStore.setState({ selectedNodeId: 'node-c', adjacentEdgeIds: [] });
      render(
        <ObjectPropertyEdge
          {...EDGE_BASE}
          data={{ label: 'p', uri: 'http://ex/p', characteristics: ['transitive'] }}
        />,
      );
      // The wrapping container for the whole edge group should carry opacity 0.15
      const tBadge = screen.getByText('T');
      // Walk up until we find an element with opacity style
      let el: HTMLElement | null = tBadge;
      let foundDimmed = false;
      while (el) {
        if (el.style?.opacity === '0.15') {
          foundDimmed = true;
          break;
        }
        el = el.parentElement;
      }
      expect(foundDimmed).toBe(true);
    });
  });
});
