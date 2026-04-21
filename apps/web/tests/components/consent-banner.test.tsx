import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    localStorage.clear();
    mockOptIn.mockClear();
    mockOptOut.mockClear();
  });

  it('renders when no consent stored', () => {
    render(<ConsentBanner />);
    expect(screen.getByText(/privacy-friendly analytics/i)).toBeInTheDocument();
    expect(screen.getByText('Accept')).toBeInTheDocument();
    expect(screen.getByText('Decline')).toBeInTheDocument();
  });

  it('hides when consent already granted', () => {
    localStorage.setItem('contexture-analytics-consent', 'granted');
    const { container } = render(<ConsentBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('hides when consent already denied', () => {
    localStorage.setItem('contexture-analytics-consent', 'denied');
    const { container } = render(<ConsentBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('stores granted consent and hides on accept', () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByText('Accept'));
    expect(localStorage.getItem('contexture-analytics-consent')).toBe('granted');
    expect(screen.queryByText('Accept')).not.toBeInTheDocument();
  });

  it('stores denied consent and hides on decline', () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByText('Decline'));
    expect(localStorage.getItem('contexture-analytics-consent')).toBe('denied');
    expect(screen.queryByText('Decline')).not.toBeInTheDocument();
  });

  it('migrates legacy ontograph-analytics-consent on first read', () => {
    localStorage.setItem('ontograph-analytics-consent', 'granted');
    const { container } = render(<ConsentBanner />);
    expect(container.innerHTML).toBe('');
    expect(localStorage.getItem('contexture-analytics-consent')).toBe('granted');
    expect(localStorage.getItem('ontograph-analytics-consent')).toBeNull();
  });
});
