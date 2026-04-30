import { type NextRequest, NextResponse } from 'next/server';
import type { GitHubAsset } from '@/lib/downloadDetection';
import { detectOS, matchAssets } from '@/lib/downloadDetection';

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

async function resolveDownload(req: NextRequest) {
  const userAgent = req.headers.get('user-agent') ?? '';
  const secChUAPlatform = req.headers.get('sec-ch-ua-platform') ?? undefined;
  const { os, arch } = detectOS(userAgent, secChUAPlatform);
  const assets = await fetchLatestAssets();
  const { primary, resolution } = matchAssets(assets, os);
  return {
    os,
    arch,
    resolution,
    url: primary?.browser_download_url ?? GITHUB_RELEASES_URL,
    assetName: primary?.name,
  };
}

export async function GET(req: NextRequest) {
  const resolved = await resolveDownload(req);

  if (req.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json(resolved);
  }

  return NextResponse.redirect(resolved.url, 302);
}
