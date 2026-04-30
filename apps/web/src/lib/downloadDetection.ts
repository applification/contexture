export type OS = 'macos' | 'windows' | 'linux' | 'unknown';

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

export interface OSDetectionResult {
  os: OS;
  arch?: string;
}

export interface AssetMatchResult {
  primary: GitHubAsset | null;
  secondary: GitHubAsset | null;
  resolution: 'auto' | 'fallback';
}

export function detectOS(userAgent: string, secChUAPlatform?: string): OSDetectionResult {
  const platform = secChUAPlatform?.toLowerCase().replace(/"/g, '').trim();

  if (platform === 'macos') return { os: 'macos' };
  if (platform === 'windows') return { os: 'windows' };
  if (platform === 'linux') return { os: 'linux' };

  if (/mac os x|macintosh/i.test(userAgent)) return { os: 'macos' };
  if (/windows nt/i.test(userAgent)) return { os: 'windows' };
  if (/linux/i.test(userAgent)) return { os: 'linux' };

  return { os: 'unknown' };
}

export function matchAssets(assets: GitHubAsset[], os: OS): AssetMatchResult {
  if (os === 'macos') {
    const primary = assets.find((a) => a.name.endsWith('.dmg')) ?? null;
    return { primary, secondary: null, resolution: primary ? 'auto' : 'fallback' };
  }
  if (os === 'windows') {
    const primary = assets.find((a) => a.name.endsWith('-setup.exe')) ?? null;
    return { primary, secondary: null, resolution: primary ? 'auto' : 'fallback' };
  }
  if (os === 'linux') {
    const primary = assets.find((a) => a.name.endsWith('.AppImage')) ?? null;
    const secondary = assets.find((a) => a.name.endsWith('.deb')) ?? null;
    return { primary, secondary, resolution: primary ? 'auto' : 'fallback' };
  }
  return { primary: null, secondary: null, resolution: 'fallback' };
}
