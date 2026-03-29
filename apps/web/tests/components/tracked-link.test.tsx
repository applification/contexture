import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockCapture } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
}));

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

import { TrackedLink } from '@/components/tracked-link';

describe('TrackedLink', () => {
  it('renders children and passes props', () => {
    render(
      <TrackedLink event="test_click" href="https://example.com" data-testid="link">
        Click me
      </TrackedLink>,
    );
    const link = screen.getByTestId('link');
    expect(link).toHaveTextContent('Click me');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('captures event on click', () => {
    render(
      <TrackedLink event="cta_click" properties={{ source: 'hero' }}>
        CTA
      </TrackedLink>,
    );
    fireEvent.click(screen.getByText('CTA'));
    expect(mockCapture).toHaveBeenCalledWith('cta_click', { source: 'hero' });
  });

  it('calls original onClick handler', () => {
    const onClick = vi.fn();
    render(
      <TrackedLink event="nav_click" onClick={onClick}>
        Nav
      </TrackedLink>,
    );
    fireEvent.click(screen.getByText('Nav'));
    expect(onClick).toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledWith('nav_click', undefined);
  });
});
