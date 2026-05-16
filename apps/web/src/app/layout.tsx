import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConsentBanner } from '@/components/consent-banner';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contexture — Design your domain once. Ship it everywhere.',
  description:
    'Contexture is the domain-model control plane for AI-native TypeScript apps. Design one source-of-truth IR, then emit Zod, JSON Schema, Convex, MCP, and AI tool schemas.',
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
    title: 'Contexture — Design your domain once. Ship it everywhere.',
    description:
      'Design one source-of-truth domain model and emit the typed surfaces your apps, agents, and databases need.',
    type: 'website',
    siteName: 'Contexture',
    images: [
      {
        url: '/images/hero-graph.png',
        width: 1600,
        height: 1200,
        alt: 'Contexture visual schema editor showing connected types on a graph canvas',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contexture — Design your domain once. Ship it everywhere.',
    description: 'The domain-model control plane for AI-native TypeScript apps.',
    images: ['/images/hero-graph.png'],
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
