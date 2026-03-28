import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ontograph — Modern Ontology Editor',
  description: 'AI-powered ontology editor with visual graph editing, OWL/RDF support, and Claude integration. Open source.',
  keywords: ['OWL ontology editor', 'RDF knowledge graph tool', 'AI ontology builder', 'ontology editor', 'knowledge graph'],
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Ontograph — Modern Ontology Editor',
    description: 'AI-powered ontology editor with visual graph editing, OWL/RDF support, and Claude integration. Open source.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
