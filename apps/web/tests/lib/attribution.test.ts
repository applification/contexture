import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRegister, mockSetPersonPropertiesForFlags } = vi.hoisted(() => ({
  mockRegister: vi.fn(),
  mockSetPersonPropertiesForFlags: vi.fn(),
}));

vi.mock('@/lib/posthog', () => ({
  posthog: {
    register: mockRegister,
    setPersonPropertiesForFlags: mockSetPersonPropertiesForFlags,
  },
}));

import { captureAttribution } from '@/lib/attribution';

describe('captureAttribution', () => {
  beforeEach(() => {
    mockRegister.mockClear();
    mockSetPersonPropertiesForFlags.mockClear();
    Object.defineProperty(window, 'location', {
      value: { search: '', pathname: '/', hostname: 'localhost' },
      writable: true,
    });
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  it('does nothing without UTMs or referrer', () => {
    captureAttribution();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('captures UTM params and registers them', () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?utm_source=google&utm_medium=cpc&utm_campaign=launch',
        pathname: '/download',
        hostname: 'localhost',
      },
      writable: true,
    });

    captureAttribution();

    expect(mockRegister).toHaveBeenCalledWith({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'launch',
      landing_page: '/download',
    });

    expect(mockSetPersonPropertiesForFlags).toHaveBeenCalledWith({
      first_touch_source: 'google',
      first_touch_medium: 'cpc',
      first_touch_campaign: 'launch',
    });
  });

  it('captures referrer when present', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://example.com',
      configurable: true,
    });

    captureAttribution();

    expect(mockRegister).toHaveBeenCalledWith({
      landing_page: '/',
      referrer: 'https://example.com',
    });
  });
});
