'use client';

import { usePostHog } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { getVisitorId } from '@/lib/visitor-id';

interface DownloadButtonProps {
  location: string;
  className?: string;
  children: ReactNode;
}

export function DownloadButton({ location, className, children }: DownloadButtonProps) {
  const ph = usePostHog();

  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();

    let url = '/download';
    let os: string | undefined;
    let arch: string | undefined;
    let assetName: string | undefined;
    let resolution: 'auto' | 'fallback' = 'fallback';

    try {
      const res = await fetch('/download', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) as {
          url: string;
          os?: string;
          arch?: string;
          assetName?: string;
          resolution?: 'auto' | 'fallback';
        };
        url = data.url;
        os = data.os;
        arch = data.arch;
        assetName = data.assetName;
        resolution = data.resolution ?? 'fallback';
      }
    } catch {
      // fall through to /download navigation
    }

    ph?.capture(
      'download_click',
      {
        visitor_id: getVisitorId(),
        platform: 'web',
        location,
        ...(os ? { os } : {}),
        ...(arch ? { arch } : {}),
        ...(assetName ? { asset_name: assetName } : {}),
        resolution,
      },
      { send_instantly: true },
    );

    if (resolution === 'fallback') {
      window.open(url, '_blank', 'noopener');
      return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <a href="/download" className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
