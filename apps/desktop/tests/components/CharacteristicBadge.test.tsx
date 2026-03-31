import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const { CharacteristicBadge } = await import('@renderer/components/detail/CharacteristicBadge');

describe('CharacteristicBadge', () => {
  afterEach(cleanup);

  describe('label rendering', () => {
    it('renders "Transitive" for transitive', () => {
      render(<CharacteristicBadge characteristic="transitive" />);
      expect(screen.getByText('Transitive')).toBeInTheDocument();
    });

    it('renders "Symmetric" for symmetric', () => {
      render(<CharacteristicBadge characteristic="symmetric" />);
      expect(screen.getByText('Symmetric')).toBeInTheDocument();
    });

    it('renders "Reflexive" for reflexive', () => {
      render(<CharacteristicBadge characteristic="reflexive" />);
      expect(screen.getByText('Reflexive')).toBeInTheDocument();
    });

    it('renders "Functional" for functional', () => {
      render(<CharacteristicBadge characteristic="functional" />);
      expect(screen.getByText('Functional')).toBeInTheDocument();
    });

    it('renders "Inv. Functional" for inverseFunctional', () => {
      render(<CharacteristicBadge characteristic="inverseFunctional" />);
      expect(screen.getByText('Inv. Functional')).toBeInTheDocument();
    });
  });

  describe('tooltip help text', () => {
    it('transitive badge has tooltip describing inference', () => {
      render(<CharacteristicBadge characteristic="transitive" />);
      // The tooltip trigger element should carry the help text as accessible title or aria-label
      // shadcn Tooltip wraps — check that tooltip content is present in DOM
      expect(screen.getByText(/A→B.*B→C.*A→C/i)).toBeInTheDocument();
    });

    it('symmetric badge has tooltip describing inference', () => {
      render(<CharacteristicBadge characteristic="symmetric" />);
      expect(screen.getByText(/A→B.*B→A/i)).toBeInTheDocument();
    });

    it('reflexive badge has tooltip describing self-relation', () => {
      render(<CharacteristicBadge characteristic="reflexive" />);
      expect(screen.getByText(/every individual.*itself/i)).toBeInTheDocument();
    });

    it('functional badge has tooltip describing single-value constraint', () => {
      render(<CharacteristicBadge characteristic="functional" />);
      expect(screen.getByText(/at most one value/i)).toBeInTheDocument();
    });

    it('inverseFunctional badge has tooltip describing single-subject constraint', () => {
      render(<CharacteristicBadge characteristic="inverseFunctional" />);
      expect(screen.getByText(/at most one subject/i)).toBeInTheDocument();
    });
  });

  describe('visual structure', () => {
    it('renders a Badge element (secondary variant class)', () => {
      const { container } = render(<CharacteristicBadge characteristic="transitive" />);
      // shadcn Badge with variant="secondary" renders with secondary styling
      const badge = container.querySelector('[class*="secondary"], [data-slot="badge"]');
      expect(badge).not.toBeNull();
    });

    it('renders exactly one badge per characteristic', () => {
      render(<CharacteristicBadge characteristic="functional" />);
      expect(screen.getAllByText('Functional')).toHaveLength(1);
    });
  });
});
