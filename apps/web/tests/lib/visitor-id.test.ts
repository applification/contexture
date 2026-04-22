import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/posthog', () => ({
  posthog: {
    get_distinct_id: vi.fn(),
  },
}));

import { posthog } from '@/lib/posthog';
import { getVisitorId } from '@/lib/visitor-id';

describe('getVisitorId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns stored id if present', () => {
    localStorage.setItem('contexture-visitor-id', 'existing-id');
    expect(getVisitorId()).toBe('existing-id');
  });

  it('uses posthog distinct_id if available', () => {
    vi.mocked(posthog.get_distinct_id).mockReturnValue('ph-id-123');
    const id = getVisitorId();
    expect(id).toBe('ph-id-123');
    expect(localStorage.getItem('contexture-visitor-id')).toBe('ph-id-123');
  });

  it('falls back to crypto.randomUUID when posthog returns falsy', () => {
    vi.mocked(posthog.get_distinct_id).mockReturnValue('');
    const id = getVisitorId();
    expect(id).toBeTruthy();
    expect(id).not.toBe('');
    expect(localStorage.getItem('contexture-visitor-id')).toBe(id);
  });

  it('caches id in localStorage for subsequent calls', () => {
    vi.mocked(posthog.get_distinct_id).mockReturnValue('ph-id');
    const first = getVisitorId();
    const second = getVisitorId();
    expect(first).toBe(second);
  });
});
