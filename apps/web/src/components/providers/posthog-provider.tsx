'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';
import { captureAttribution } from '@/lib/attribution';
import { initPostHog, posthog } from '@/lib/posthog';

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!pathname || !ph) return;
    const url =
      window.origin + pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    ph.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}

function PostHogInit() {
  useEffect(() => {
    initPostHog();
    captureAttribution();
  }, []);
  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogInit />
      <PostHogPageView />
      {children}
    </PHProvider>
  );
}
