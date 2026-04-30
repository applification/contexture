const GITHUB_RELEASES_API = 'https://api.github.com/repos/applification/contexture/releases';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
}

export async function fetchReleases(): Promise<GitHubRelease[]> {
  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as GitHubRelease[];
    return data.filter((r) => !r.draft && !r.prerelease);
  } catch {
    return [];
  }
}
