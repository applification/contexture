import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mockOptIn, mockOptOut } = vi.hoisted(() => ({
  mockOptIn: vi.fn(),
  mockOptOut: vi.fn(),
}));

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({
    opt_in_capturing: mockOptIn,
    opt_out_capturing: mockOptOut,
  }),
}));

import { ConsentBanner } from '@/components/consent-banner';

describe('ConsentBanner', () => {
  it('renders when no consent stored', () => {
    render(<ConsentBanner />);
    expect(screen.getByText(/privacy-friendly analytics/i)).toBeInTheDocument();
    expect(screen.getByText('Accept')).toBeInTheDocument();
    expect(screen.getByText('Decline')).toBeInTheDocument();
  });

  it('hides when consent already granted', () => {
    localStorage.setItem('ontograph-analytics-consent', 'granted');
    const { container } = render(<ConsentBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('hides when consent already denied', () => {
    localStorage.setItem('ontograph-analytics-consent', 'denied');
    const { container } = render(<ConsentBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('stores granted consent and hides on accept', () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByText('Accept'));
    expect(localStorage.getItem('ontograph-analytics-consent')).toBe('granted');
    expect(screen.queryByText('Accept')).not.toBeInTheDocument();
  });

  it('stores denied consent and hides on decline', () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByText('Decline'));
    expect(localStorage.getItem('ontograph-analytics-consent')).toBe('denied');
    expect(screen.queryByText('Decline')).not.toBeInTheDocument();
  });
});
