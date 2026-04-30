import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchReleases } from '@/lib/changelog';

const SAMPLE_RELEASES = [
  {
    tag_name: 'v1.2.0',
    name: 'v1.2.0',
    body: '## What changed\n\n- Added new feature\n- Fixed a bug',
    published_at: '2024-03-01T00:00:00Z',
    draft: false,
    prerelease: false,
  },
  {
    tag_name: 'v1.1.0',
    name: 'v1.1.0',
    body: '## Changes\n\n- Initial release',
    published_at: '2024-02-01T00:00:00Z',
    draft: false,
    prerelease: false,
  },
  {
    tag_name: 'v1.1.1-beta',
    name: 'v1.1.1-beta',
    body: 'Beta release',
    published_at: '2024-02-15T00:00:00Z',
    draft: false,
    prerelease: true,
  },
  {
    tag_name: 'v1.2.1-draft',
    name: 'v1.2.1-draft',
    body: 'Draft release',
    published_at: '2024-03-15T00:00:00Z',
    draft: true,
    prerelease: false,
  },
];

describe('fetchReleases', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns stable releases from GitHub', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_RELEASES,
    } as Response);

    const releases = await fetchReleases();

    expect(releases).toHaveLength(2);
    expect(releases[0].tag_name).toBe('v1.2.0');
    expect(releases[1].tag_name).toBe('v1.1.0');
  });

  it('filters out prerelease entries', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_RELEASES,
    } as Response);

    const releases = await fetchReleases();

    expect(releases.every((r) => !r.prerelease)).toBe(true);
  });

  it('filters out draft entries', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_RELEASES,
    } as Response);

    const releases = await fetchReleases();

    expect(releases.every((r) => !r.draft)).toBe(true);
  });

  it('returns empty array when GitHub API returns non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    const releases = await fetchReleases();

    expect(releases).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const releases = await fetchReleases();

    expect(releases).toEqual([]);
  });
});
