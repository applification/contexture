import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { fetchReleases } from '@/lib/changelog';

export const metadata: Metadata = {
  title: 'Changelog — Contexture',
  description: 'Release history and what has changed in each version of Contexture.',
};

function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <line
        x1="8"
        y1="24"
        x2="24"
        y2="24"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="24"
        x2="16"
        y2="8"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="24"
        y1="24"
        x2="16"
        y2="8"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="8" r="3.5" fill="var(--primary)" />
      <circle cx="8" cy="24" r="3.5" fill="var(--primary)" />
      <circle cx="24" cy="24" r="3.5" fill="var(--accent)" />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function ChangelogPage() {
  const releases = await fetchReleases();

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LogoMark className="size-6" />
            Contexture
          </a>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Changelog</span>
            <AnimatedThemeToggler className="size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors [&_svg]:size-4" />
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-8 pt-32 pb-20">
        {/* Hero */}
        <header className="pb-16 border-b border-border/30">
          <p className="text-sm text-accent font-medium tracking-widest uppercase mb-4">
            Release History
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">Changelog</h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            What&apos;s new in each version of Contexture.
          </p>
        </header>

        {/* Releases */}
        {releases.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <p>No releases found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {releases.map((release) => (
              <article key={release.tag_name} className="py-12">
                <header className="mb-6">
                  <div className="flex flex-wrap items-baseline gap-4 mb-2">
                    <h2 className="text-2xl font-bold tracking-tight">{release.tag_name}</h2>
                    {release.name && release.name !== release.tag_name && (
                      <span className="text-lg text-muted-foreground">{release.name}</span>
                    )}
                  </div>
                  <time
                    dateTime={release.published_at}
                    className="text-sm text-muted-foreground font-mono"
                  >
                    {formatDate(release.published_at)}
                  </time>
                </header>
                {release.body && (
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => (
                          <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">
                            {children}
                          </h3>
                        ),
                        h2: ({ children }) => (
                          <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">
                            {children}
                          </h3>
                        ),
                        h3: ({ children }) => (
                          <h4 className="text-base font-semibold text-foreground mt-5 mb-2">
                            {children}
                          </h4>
                        ),
                        h4: ({ children }) => (
                          <h5 className="text-sm font-semibold text-foreground mt-4 mb-2">
                            {children}
                          </h5>
                        ),
                        p: ({ children }) => <p className="mb-3">{children}</p>,
                        ul: ({ children }) => (
                          <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
                        ),
                        li: ({ children }) => <li>{children}</li>,
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            className="text-accent hover:underline"
                            target={href?.startsWith('http') ? '_blank' : undefined}
                            rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                          >
                            {children}
                          </a>
                        ),
                        code: ({ children }) => (
                          <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="p-3 rounded-md bg-muted text-foreground font-mono text-xs overflow-x-auto mb-3">
                            {children}
                          </pre>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-border pl-4 italic mb-3">
                            {children}
                          </blockquote>
                        ),
                        hr: () => <hr className="my-4 border-border/50" />,
                        strong: ({ children }) => (
                          <strong className="font-semibold text-foreground">{children}</strong>
                        ),
                      }}
                    >
                      {release.body}
                    </ReactMarkdown>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border/30 py-10 px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <a href="/" className="flex items-center gap-2 hover:text-foreground transition-colors">
            <LogoMark className="size-4" />
            Contexture
          </a>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/applification/contexture"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a href="/changelog" className="hover:text-foreground transition-colors">
              Changelog
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
