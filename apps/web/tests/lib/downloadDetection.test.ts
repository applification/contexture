import { describe, expect, it } from 'vitest';
import type { GitHubAsset } from '@/lib/downloadDetection';
import { detectOS, matchAssets } from '@/lib/downloadDetection';

const SAMPLE_ASSETS: GitHubAsset[] = [
  {
    name: 'Contexture-1.2.3.dmg',
    browser_download_url: 'https://example.com/Contexture-1.2.3.dmg',
  },
  {
    name: 'Contexture-1.2.3-setup.exe',
    browser_download_url: 'https://example.com/Contexture-1.2.3-setup.exe',
  },
  {
    name: 'Contexture-1.2.3.AppImage',
    browser_download_url: 'https://example.com/Contexture-1.2.3.AppImage',
  },
  {
    name: 'Contexture-1.2.3-amd64.deb',
    browser_download_url: 'https://example.com/Contexture-1.2.3-amd64.deb',
  },
];

describe('detectOS', () => {
  it('detects macOS from User-Agent', () => {
    const result = detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    expect(result.os).toBe('macos');
  });

  it('detects Windows from User-Agent', () => {
    const result = detectOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    expect(result.os).toBe('windows');
  });

  it('detects Linux from User-Agent', () => {
    const result = detectOS('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
    expect(result.os).toBe('linux');
  });

  it('returns unknown for unrecognised User-Agent', () => {
    const result = detectOS('curl/7.88.1');
    expect(result.os).toBe('unknown');
  });

  it('prefers Sec-CH-UA-Platform over User-Agent for macOS', () => {
    const result = detectOS('Mozilla/5.0 (Windows NT 10.0)', '"macOS"');
    expect(result.os).toBe('macos');
  });

  it('prefers Sec-CH-UA-Platform over User-Agent for Windows', () => {
    const result = detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '"Windows"');
    expect(result.os).toBe('windows');
  });

  it('prefers Sec-CH-UA-Platform over User-Agent for Linux', () => {
    const result = detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '"Linux"');
    expect(result.os).toBe('linux');
  });
});

describe('matchAssets', () => {
  it('returns .dmg as primary for macOS', () => {
    const result = matchAssets(SAMPLE_ASSETS, 'macos');
    expect(result.primary?.name).toBe('Contexture-1.2.3.dmg');
    expect(result.secondary).toBeNull();
    expect(result.resolution).toBe('auto');
  });

  it('returns -setup.exe as primary for Windows', () => {
    const result = matchAssets(SAMPLE_ASSETS, 'windows');
    expect(result.primary?.name).toBe('Contexture-1.2.3-setup.exe');
    expect(result.secondary).toBeNull();
    expect(result.resolution).toBe('auto');
  });

  it('returns .AppImage as primary and .deb as secondary for Linux', () => {
    const result = matchAssets(SAMPLE_ASSETS, 'linux');
    expect(result.primary?.name).toBe('Contexture-1.2.3.AppImage');
    expect(result.secondary?.name).toBe('Contexture-1.2.3-amd64.deb');
    expect(result.resolution).toBe('auto');
  });

  it('returns fallback resolution for unknown OS', () => {
    const result = matchAssets(SAMPLE_ASSETS, 'unknown');
    expect(result.primary).toBeNull();
    expect(result.secondary).toBeNull();
    expect(result.resolution).toBe('fallback');
  });

  it('returns fallback resolution when no matching asset exists', () => {
    const result = matchAssets([], 'macos');
    expect(result.primary).toBeNull();
    expect(result.resolution).toBe('fallback');
  });

  it('returns fallback when Linux has no AppImage', () => {
    const assets = SAMPLE_ASSETS.filter((a) => !a.name.endsWith('.AppImage'));
    const result = matchAssets(assets, 'linux');
    expect(result.primary).toBeNull();
    expect(result.secondary?.name).toBe('Contexture-1.2.3-amd64.deb');
    expect(result.resolution).toBe('fallback');
  });
});
