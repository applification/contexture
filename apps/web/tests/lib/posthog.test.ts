import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInit } = vi.hoisted(() => ({
  mockInit: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    __loaded: false,
    init: mockInit,
  },
}));

import { initPostHog } from '@/lib/posthog';

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { hostname },
    configurable: true,
  });
}

describe('initPostHog', () => {
  beforeEach(() => {
    mockInit.mockClear();
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not initialize analytics on Portless localhost domains', () => {
    setHostname('web.localhost');

    initPostHog();

    expect(mockInit).not.toHaveBeenCalled();
  });

  it('initializes analytics on public hosts', () => {
    setHostname('contexture.dev');

    initPostHog();

    expect(mockInit).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        persistence: 'memory',
      }),
    );
  });
});
