import { headers } from 'next/headers';
import type { GitHubAsset } from '@/lib/downloadDetection';
import { detectOS, matchAssets } from '@/lib/downloadDetection';
import { DownloadRedirect } from './download-redirect';

const GITHUB_RELEASES_URL = 'https://github.com/applification/contexture/releases/latest';
const GITHUB_API_URL = 'https://api.github.com/repos/applification/contexture/releases/latest';

async function fetchLatestAssets(): Promise<GitHubAsset[]> {
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { assets?: GitHubAsset[] };
    return data.assets ?? [];
  } catch {
    return [];
  }
}

export default async function DownloadPage() {
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') ?? '';
  const secChUAPlatform = headersList.get('sec-ch-ua-platform') ?? undefined;

  const { os, arch } = detectOS(userAgent, secChUAPlatform);
  const assets = await fetchLatestAssets();
  const { primary, secondary, resolution } = matchAssets(assets, os);

  return (
    <DownloadRedirect
      os={os}
      arch={arch}
      assetName={primary?.name}
      downloadUrl={primary?.browser_download_url}
      secondaryUrl={secondary?.browser_download_url}
      secondaryName={secondary?.name}
      fallbackUrl={GITHUB_RELEASES_URL}
      resolution={resolution}
    />
  );
}
