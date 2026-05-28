import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Suspense } from 'react';
import { ConsentBanner } from '@/components/consent-banner';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import './globals.css';

const themeInitScript = `
(() => {
  try {
    const storedTheme = localStorage.getItem('theme');
    const useDarkTheme = storedTheme ? storedTheme === 'dark' : true;
    document.documentElement.classList.toggle('dark', useDarkTheme);
  } catch {
    document.documentElement.classList.add('dark');
  }
})();
`;

export const metadata: Metadata = {
  title: 'Contexture — Convex models for apps and agents.',
  description:
    'Contexture is the desktop control plane for Convex app models. Design one source-of-truth IR, then emit convex/schema.ts, validators, and agent-ready supporting contracts.',
  keywords: [
    'Convex model control plane',
    'Convex domain model',
    'Contexture',
    'Convex schema generator',
    'Convex validators',
    'Zod schema generator',
    'MCP server',
    'LLM structured output',
    'JSON Schema editor',
    'AI tool schemas',
  ],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Contexture — Convex models for apps and agents.',
    description:
      'Design one source-of-truth Convex model and emit the schema, validators, and supporting contracts your app and agents need.',
    type: 'website',
    siteName: 'Contexture',
    images: [
      {
        url: '/images/misprint-graph-overview.png',
        width: 1600,
        height: 1200,
        alt: 'Contexture desktop app showing a graph of connected Convex domain types',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contexture — Convex models for apps and agents.',
    description: 'A source-of-truth Convex model your app and agents can share.',
    images: ['/images/misprint-graph-overview.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable}`} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Suspense fallback={null}>
          <PostHogProvider>
            {children}
            <ConsentBanner />
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
