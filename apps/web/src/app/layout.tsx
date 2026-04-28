import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConsentBanner } from '@/components/consent-banner';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contexture — Visual Zod schema editor',
  description:
    'Visual Zod schema editor with multi-model AI support. Chat with any LLM to build closed-world schemas; emit Zod + JSON Schema for your structured-output pipelines.',
  keywords: [
    'Zod schema editor',
    'visual schema builder',
    'LLM structured output',
    'JSON Schema editor',
    'TypeScript schema tool',
    'multi-model AI',
    'schema design',
    'AI agents',
  ],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Contexture — Visual Zod schema editor',
    description:
      'Chat with any LLM to build closed-world Zod schemas. Emit Zod + JSON Schema for your structured-output pipelines.',
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
    title: 'Contexture — Visual Zod schema editor',
    description:
      'Chat to build closed-world Zod schemas; emit Zod + JSON Schema for LLM structured-output pipelines.',
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
