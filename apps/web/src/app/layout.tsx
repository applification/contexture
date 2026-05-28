import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConsentBanner } from '@/components/consent-banner';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contexture — Desktop domain models for apps and agents.',
  description:
    'Contexture is the desktop control plane for TypeScript domain models. Design one source-of-truth IR, then emit Zod, JSON Schema, Convex, MCP, and agent-ready contracts.',
  keywords: [
    'domain model control plane',
    'TypeScript domain model',
    'Contexture',
    'Zod schema generator',
    'Convex schema generator',
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
    title: 'Contexture — Desktop domain models for apps and agents.',
    description:
      'Design one source-of-truth domain model and emit the typed surfaces your apps, agents, and databases need.',
    type: 'website',
    siteName: 'Contexture',
    images: [
      {
        url: '/images/misprint-graph-overview.png',
        width: 1600,
        height: 1200,
        alt: 'Contexture desktop app showing a graph of connected domain types',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contexture — Desktop domain models for apps and agents.',
    description: 'A source-of-truth model your app and agents can share.',
    images: ['/images/misprint-graph-overview.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable}`} suppressHydrationWarning>
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
