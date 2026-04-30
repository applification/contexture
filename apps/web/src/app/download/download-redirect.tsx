'use client';

import { usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';
import type { OS } from '@/lib/downloadDetection';
import { getVisitorId } from '@/lib/visitor-id';

interface DownloadRedirectProps {
  os: OS;
  arch?: string;
  assetName?: string;
  downloadUrl?: string;
  secondaryUrl?: string;
  secondaryName?: string;
  fallbackUrl: string;
  resolution: 'auto' | 'fallback';
}

export function DownloadRedirect({
  os,
  arch,
  assetName,
  downloadUrl,
  secondaryUrl,
  secondaryName,
  fallbackUrl,
  resolution,
}: DownloadRedirectProps) {
  const ph = usePostHog();

  useEffect(() => {
    const visitorId = getVisitorId();

    ph?.capture(
      'download_initiated',
      {
        visitor_id: visitorId,
        platform: 'web',
        referrer: document.referrer || undefined,
        os,
        ...(arch ? { arch } : {}),
        ...(assetName ? { asset_name: assetName } : {}),
        resolution,
        $set: { visitor_id: visitorId },
      },
      { send_instantly: true },
    );

    const redirectUrl = downloadUrl ?? fallbackUrl;
    const timeout = setTimeout(() => {
      window.location.href = redirectUrl;
    }, 500);

    return () => clearTimeout(timeout);
  }, [ph, os, arch, assetName, downloadUrl, fallbackUrl, resolution]);

  if (!downloadUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">Download Contexture</p>
          <p className="text-sm text-muted-foreground mb-4">
            Select the installer for your platform:
          </p>
          <a href={fallbackUrl} className="underline hover:text-foreground transition-colors">
            View all downloads on GitHub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-lg font-medium mb-2">Redirecting to download&hellip;</p>
        <p className="text-sm text-muted-foreground">
          If you are not redirected,{' '}
          <a href={downloadUrl} className="underline hover:text-foreground transition-colors">
            click here
          </a>
          .
        </p>
        {secondaryUrl && (
          <p className="text-sm text-muted-foreground mt-2">
            Also available:{' '}
            <a href={secondaryUrl} className="underline hover:text-foreground transition-colors">
              {secondaryName ?? 'alternative package'}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
