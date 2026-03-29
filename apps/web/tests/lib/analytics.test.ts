import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCapture } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
}));

vi.mock('@/lib/posthog', () => ({
  posthog: { capture: mockCapture },
}));

vi.mock('@/lib/visitor-id', () => ({
  getVisitorId: vi.fn(() => 'test-visitor-id'),
}));

import { analytics } from '@/lib/analytics';

describe('analytics', () => {
  beforeEach(() => {
    mockCapture.mockClear();
  });

  it('tracks hero CTA click', () => {
    analytics.heroCTAClick();
    expect(mockCapture).toHaveBeenCalledWith('hero_cta_click', { platform: 'web' });
  });

  it('tracks download click with OS and visitor_id', () => {
    analytics.downloadClick('macos');
    expect(mockCapture).toHaveBeenCalledWith('download_click', {
      os: 'macos',
      platform: 'web',
      visitor_id: 'test-visitor-id',
    });
  });

  it('tracks pricing page view', () => {
    analytics.pricingPageView();
    expect(mockCapture).toHaveBeenCalledWith('pricing_page_view', { platform: 'web' });
  });

  it('tracks github click', () => {
    analytics.githubClick();
    expect(mockCapture).toHaveBeenCalledWith('github_click', { platform: 'web' });
  });

  it('tracks features section view', () => {
    analytics.featuresSectionView();
    expect(mockCapture).toHaveBeenCalledWith('features_section_view', { platform: 'web' });
  });
});
