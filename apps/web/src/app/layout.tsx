import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConsentBanner } from '@/components/consent-banner';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ontograph — Modern Ontology Editor',
  description:
    'AI-powered ontology editor with visual graph editing, OWL/RDF support, and Claude integration. Build the knowledge layer your AI agents need.',
  keywords: [
    'OWL ontology editor',
    'RDF knowledge graph tool',
    'AI ontology builder',
    'ontology editor',
    'knowledge graph',
    'AI agents',
    'ontology',
    'knowledge layer',
  ],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Ontograph — Modern Ontology Editor',
    description:
      'Build the knowledge layer your AI agents need. AI-powered ontology editor with visual graph editing, OWL/RDF support, and Claude integration.',
    type: 'website',
    siteName: 'Ontograph',
    images: [
      {
        url: '/images/hero-graph.png',
        width: 1600,
        height: 1200,
        alt: 'Ontograph visual graph editor showing a People ontology with connected classes',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ontograph — Modern Ontology Editor',
    description:
      'Build the knowledge layer your AI agents need. AI-powered visual graph editor with OWL/RDF support.',
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
