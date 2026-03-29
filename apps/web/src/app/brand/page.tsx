import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

const TokenBlock = dynamic(() => import('./token-block').then((m) => ({ default: m.TokenBlock })), {
  loading: () => <div className="animate-pulse h-40 bg-muted rounded-lg" />,
});

export const metadata: Metadata = {
  title: 'Brand — Ontograph',
  description:
    'Ontograph brand identity guidelines: logo, colors, typography, voice, and components.',
};

/* ------------------------------------------------------------------ */
/*  Logo mark — three connected nodes in a triangle                   */
/* ------------------------------------------------------------------ */
function LogoMark({
  className,
  variant = 'color',
}: {
  className?: string;
  variant?: 'color' | 'mono-light' | 'mono-dark';
}) {
  const primary =
    variant === 'mono-light' ? '#000' : variant === 'mono-dark' ? '#fff' : 'var(--primary)';
  const accent =
    variant === 'mono-light' ? '#000' : variant === 'mono-dark' ? '#fff' : 'var(--accent)';
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <line
        x1="8"
        y1="24"
        x2="24"
        y2="24"
        stroke={primary}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="24"
        x2="16"
        y2="8"
        stroke={primary}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="24"
        y1="24"
        x2="16"
        y2="8"
        stroke={primary}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="8" r="3.5" fill={primary} />
      <circle cx="8" cy="24" r="3.5" fill={primary} />
      <circle cx="24" cy="24" r="3.5" fill={accent} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Color swatch component                                            */
/* ------------------------------------------------------------------ */
function Swatch({
  name,
  value,
  token,
  dark,
}: {
  name: string;
  value: string;
  token: string;
  dark?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`h-20 rounded-lg border border-border/40 ${dark ? 'ring-1 ring-inset ring-white/10' : ''}`}
        style={{ backgroundColor: value }}
      />
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground font-mono">{token}</p>
        <p className="text-xs text-muted-foreground font-mono">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Type specimen                                                     */
/* ------------------------------------------------------------------ */
function TypeSpecimen({
  font,
  name,
  weights,
  example,
}: {
  font: string;
  name: string;
  weights: string;
  example: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-8">
      <div className="flex items-baseline justify-between mb-4">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {name}
        </h4>
        <span className="text-xs text-muted-foreground">{weights}</span>
      </div>
      <p className={`text-3xl leading-snug ${font}`}>{example}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                   */
/* ------------------------------------------------------------------ */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-20 border-b border-border/30">
      <h2 className="text-2xl font-bold tracking-tight mb-10">{title}</h2>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */
export default function BrandPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LogoMark className="size-6" />
            Ontograph
          </a>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Brand Identity</span>
            <AnimatedThemeToggler className="size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors [&_svg]:size-4" />
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-8 pt-32 pb-20">
        {/* Hero */}
        <header className="pb-16 border-b border-border/30">
          <p className="text-sm text-accent font-medium tracking-widest uppercase mb-4">
            Brand Guidelines
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            Ontograph Brand Identity
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            The visual and verbal identity standards for Ontograph. Use these guidelines to maintain
            consistency across all touchpoints — from marketing to product UI.
          </p>
          <nav className="mt-10 flex flex-wrap gap-3 text-sm">
            {['Logo', 'Colors', 'Typography', 'Voice', 'Components', 'Motion'].map((s) => (
              <a
                key={s}
                href={`#${s.toLowerCase()}`}
                className="px-4 py-2 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                {s}
              </a>
            ))}
          </nav>
        </header>

        {/* -------------------------------------------------------- */}
        {/*  Logo                                                     */}
        {/* -------------------------------------------------------- */}
        <Section id="logo" title="Logo">
          <p className="text-muted-foreground mb-8 max-w-2xl leading-relaxed">
            The Ontograph mark represents three connected nodes in a triangle — the fundamental
            ontology structure of subject-predicate-object triples. It should never be filled,
            rotated, or modified with effects.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {/* Full color on dark */}
            <div className="rounded-xl border border-border/60 bg-[oklch(0.14_0.02_270)] p-10 flex flex-col items-center gap-6">
              <LogoMark className="size-16" variant="color" />
              <div className="flex items-center gap-2">
                <LogoMark className="size-6" variant="color" />
                <span className="text-lg font-semibold text-[oklch(0.93_0.01_270)]">Ontograph</span>
              </div>
              <span className="text-xs text-muted-foreground">Full color — dark background</span>
            </div>
            {/* Mono on light */}
            <div className="rounded-xl border border-border/60 bg-white p-10 flex flex-col items-center gap-6">
              <LogoMark className="size-16" variant="mono-light" />
              <div className="flex items-center gap-2">
                <LogoMark className="size-6" variant="mono-light" />
                <span className="text-lg font-semibold text-black">Ontograph</span>
              </div>
              <span className="text-xs text-gray-500">Monochrome — light background</span>
            </div>
            {/* Mono on dark */}
            <div className="rounded-xl border border-border/60 bg-black p-10 flex flex-col items-center gap-6">
              <LogoMark className="size-16" variant="mono-dark" />
              <div className="flex items-center gap-2">
                <LogoMark className="size-6" variant="mono-dark" />
                <span className="text-lg font-semibold text-white">Ontograph</span>
              </div>
              <span className="text-xs text-gray-400">Monochrome — dark background</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-8">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Usage rules
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                Always title-case: <strong className="text-foreground">Ontograph</strong>, never
                "ontograph" or "ONTOGRAPH".
              </li>
              <li>
                Minimum clear space around the mark: equal to the diameter of one node circle.
              </li>
              <li>Never stretch, rotate, add drop shadows, or apply gradients to the mark.</li>
              <li>
                For constrained contexts (favicon, 16px), use the mark alone without the wordmark.
              </li>
            </ul>
          </div>
        </Section>

        {/* -------------------------------------------------------- */}
        {/*  Colors                                                   */}
        {/* -------------------------------------------------------- */}
        <Section id="colors" title="Color Palette">
          <p className="text-muted-foreground mb-8 max-w-2xl leading-relaxed">
            All colors use OKLCH for perceptual uniformity. The palette is built around deep indigo
            (intelligence, depth) with electric cyan as an accent (data, interactivity).
          </p>

          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Primary &amp; Accent
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
            <Swatch name="Deep Indigo" value="oklch(0.45 0.15 270)" token="--primary (light)" />
            <Swatch name="Soft Violet" value="oklch(0.65 0.12 280)" token="--primary (dark)" dark />
            <Swatch name="Electric Cyan" value="oklch(0.75 0.15 195)" token="--accent" />
            <Swatch name="Ring / Focus" value="oklch(0.45 0.15 270)" token="--ring (light)" />
          </div>

          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Semantic
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
            <Swatch name="Success" value="oklch(0.6 0.2 145)" token="--success" />
            <Swatch name="Warning" value="oklch(0.7 0.15 75)" token="--warning" />
            <Swatch name="Destructive" value="oklch(0.55 0.2 25)" token="--destructive" />
            <Swatch name="Muted" value="oklch(0.5 0.03 270)" token="--muted-foreground" />
          </div>

          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Backgrounds &amp; Surfaces
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
            <Swatch name="Background (light)" value="oklch(0.98 0.005 270)" token="--background" />
            <Swatch
              name="Background (dark)"
              value="oklch(0.14 0.02 270)"
              token="--background"
              dark
            />
            <Swatch name="Card (light)" value="oklch(1 0 0)" token="--card" />
            <Swatch name="Card (dark)" value="oklch(0.18 0.02 270)" token="--card" dark />
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-8">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Neutrals
            </h3>
            <p className="text-sm text-muted-foreground">
              All neutral grays carry a subtle cool tint at 270 hue angle (indigo family). This
              creates a cohesive feel without being obviously tinted. Dark mode is the{' '}
              <strong className="text-foreground">default</strong> theme — the graph canvas renders
              best on dark backgrounds.
            </p>
          </div>
        </Section>

        {/* -------------------------------------------------------- */}
        {/*  Typography                                               */}
        {/* -------------------------------------------------------- */}
        <Section id="typography" title="Typography">
          <p className="text-muted-foreground mb-8 max-w-2xl leading-relaxed">
            Geist provides a geometric, modern character with excellent readability at all sizes.
            The monospace variant handles OWL URIs and Turtle code snippets.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 mb-10">
            <TypeSpecimen
              font="font-sans"
              name="Geist Sans"
              weights="100 — 900 (variable)"
              example="Build the knowledge layer your AI agents need."
            />
            <TypeSpecimen
              font="font-mono"
              name="Geist Mono"
              weights="100 — 900 (variable)"
              example="owl:Class rdf:type rdfs:Resource"
            />
          </div>

          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Type scale
          </h3>
          <div className="rounded-xl border border-border/60 bg-card/30 p-8 space-y-6">
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">
                text-2xl
              </span>
              <span className="text-2xl font-bold">Page Titles</span>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">text-lg</span>
              <span className="text-lg font-semibold">Section Headings</span>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">
                text-base
              </span>
              <span className="text-base">Primary content and body text</span>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">text-sm</span>
              <span className="text-sm text-muted-foreground">
                Labels, descriptions, secondary text
              </span>
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">text-xs</span>
              <span className="text-xs text-muted-foreground">Status bar, metadata, badges</span>
            </div>
          </div>
        </Section>

        {/* -------------------------------------------------------- */}
        {/*  Voice & Tone                                             */}
        {/* -------------------------------------------------------- */}
        <Section id="voice" title="Voice & Tone">
          <p className="text-muted-foreground mb-8 max-w-2xl leading-relaxed">
            Ontograph speaks to engineers who ship products — precise, confident, and approachable.
            Never academic, never dismissive.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 mb-10">
            <div className="rounded-xl border border-border/60 bg-card/30 p-8">
              <h3 className="text-sm font-medium text-accent uppercase tracking-wider mb-4">Do</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <strong className="text-foreground">Precise</strong> — Use correct terminology
                  (ontology, OWL, RDF) without being academic.
                </li>
                <li>
                  <strong className="text-foreground">Confident</strong> — State what we do
                  directly, no hedging.
                </li>
                <li>
                  <strong className="text-foreground">Approachable</strong> — Make ontology
                  engineering feel accessible.
                </li>
                <li>
                  <strong className="text-foreground">Builder-oriented</strong> — Speak to people
                  who ship, not who publish.
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/30 p-8">
              <h3 className="text-sm font-medium text-destructive uppercase tracking-wider mb-4">
                Don&apos;t
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>Don&apos;t mock existing tools or their users.</li>
                <li>Don&apos;t use passive voice or hedging language.</li>
                <li>Don&apos;t overuse jargon — use plain language for UI labels.</li>
                <li>Don&apos;t use buzzwords without substance.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-8">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Key phrases
            </h3>
            <div className="grid sm:grid-cols-3 gap-x-8 gap-y-2 text-sm">
              <p className="text-foreground">&ldquo;Where knowledge takes shape.&rdquo;</p>
              <p className="text-foreground">
                &ldquo;Build the knowledge layer your AI agents need.&rdquo;
              </p>
              <p className="text-foreground">
                &ldquo;From natural language to formal ontology in minutes.&rdquo;
              </p>
              <p className="text-foreground">&ldquo;See your ontology as a living graph.&rdquo;</p>
              <p className="text-foreground">
                &ldquo;The ontology editor built for the AI era.&rdquo;
              </p>
              <p className="text-foreground">
                &ldquo;Full OWL/RDF/Turtle support — no vendor lock-in.&rdquo;
              </p>
              <p className="text-foreground">
                &ldquo;Create ontologies that ground your AI — not guesswork.&rdquo;
              </p>
              <p className="text-foreground">
                &ldquo;AI-powered validation scores your ontology as you build.&rdquo;
              </p>
              <p className="text-foreground">
                &ldquo;The missing tool between your data and your AI agents.&rdquo;
              </p>
            </div>
          </div>
        </Section>

        {/* -------------------------------------------------------- */}
        {/*  Components                                               */}
        {/* -------------------------------------------------------- */}
        <Section id="components" title="Components">
          <p className="text-muted-foreground mb-8 max-w-2xl leading-relaxed">
            Built on shadcn/ui with Tailwind CSS v4. Prefer existing shadcn components over custom
            implementations. Extend, don&apos;t reinvent.
          </p>

          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Buttons
          </h3>
          <div className="flex flex-wrap gap-4 mb-10">
            <button className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              Primary
            </button>
            <button className="bg-secondary text-secondary-foreground px-5 py-2.5 rounded-lg text-sm font-medium border border-border/60 hover:bg-secondary/80 transition-colors">
              Secondary
            </button>
            <button className="px-5 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              Ghost
            </button>
            <button className="bg-destructive text-destructive-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              Destructive
            </button>
          </div>

          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Cards
          </h3>
          <div className="grid sm:grid-cols-2 gap-6 mb-10">
            <div className="rounded-xl border border-border/60 bg-card/50 p-8 hover:border-primary/30 transition-colors">
              <div className="size-11 rounded-lg bg-primary/10 flex items-center justify-center mb-5">
                <svg
                  className="size-5 text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold mb-2">Feature Card</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Cards use border-border/60 with bg-card/50. Hover state shifts border toward
                primary/30.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/30 p-8 font-mono text-sm">
              <div className="text-muted-foreground/70 text-xs uppercase tracking-wide mb-2">
                Terminal block
              </div>
              <p className="text-muted-foreground">$ ontograph export --format turtle</p>
              <p className="text-accent">Exported 42 classes, 18 properties</p>
            </div>
          </div>

          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Badges &amp; pills
          </h3>
          <div className="flex flex-wrap gap-3 mb-10">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border border-accent/20 bg-accent/5 text-accent">
              Powered by Claude
            </span>
            <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full border border-border/60 text-muted-foreground">
              v0.1.0
            </span>
            <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full bg-success/10 text-success border border-success/20">
              Stable
            </span>
            <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full bg-warning/10 text-warning border border-warning/20">
              Beta
            </span>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-8">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Design system stack
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">shadcn/ui</strong> — component primitives
                (Button, Dialog, Popover, etc.)
              </li>
              <li>
                <strong className="text-foreground">Tailwind CSS v4</strong> — utility-first styling
                with OKLCH color tokens
              </li>
              <li>
                <strong className="text-foreground">Geist</strong> — sans + mono variable fonts
              </li>
              <li>
                <strong className="text-foreground">Lucide</strong> — icon set, consistent stroke
                style
              </li>
              <li>
                <strong className="text-foreground">Framer Motion</strong> — complex animations; CSS
                transitions for simple states
              </li>
            </ul>
          </div>
        </Section>

        {/* -------------------------------------------------------- */}
        {/*  Motion                                                   */}
        {/* -------------------------------------------------------- */}
        <Section id="motion" title="Motion">
          <p className="text-muted-foreground mb-8 max-w-2xl leading-relaxed">
            Motion is purposeful and restrained. Every animation serves a function — guiding
            attention, confirming actions, or smoothing transitions.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 mb-10">
            <div className="rounded-xl border border-border/60 bg-card/30 p-8">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                Duration scale
              </h3>
              <div className="space-y-4">
                {[
                  { label: 'Micro', duration: '150ms', easing: 'ease-out', desc: 'Hover, focus' },
                  {
                    label: 'Standard',
                    duration: '200ms',
                    easing: 'ease-in-out',
                    desc: 'Panels, modals',
                  },
                  {
                    label: 'Emphasis',
                    duration: '300ms',
                    easing: 'spring',
                    desc: 'Page transitions',
                  },
                  { label: 'Graph', duration: '500ms', easing: 'spring', desc: 'Layout animation' },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-4">
                    <span className="text-sm font-medium w-20">{m.label}</span>
                    <span className="text-xs font-mono text-muted-foreground w-16">
                      {m.duration}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground w-20">{m.easing}</span>
                    <span className="text-xs text-muted-foreground">{m.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/30 p-8">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                Principles
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <strong className="text-foreground">Purposeful</strong> — every animation serves
                  user comprehension.
                </li>
                <li>
                  <strong className="text-foreground">Quick</strong> — no animation should feel like
                  waiting.
                </li>
                <li>
                  <strong className="text-foreground">Consistent</strong> — same pattern = same
                  duration/easing.
                </li>
                <li>
                  <strong className="text-foreground">Reducible</strong> — respect
                  prefers-reduced-motion.
                </li>
              </ul>
            </div>
          </div>
        </Section>

        {/* -------------------------------------------------------- */}
        {/*  Quick Reference                                          */}
        {/* -------------------------------------------------------- */}
        <section id="reference" className="scroll-mt-24 py-20">
          <h2 className="text-2xl font-bold tracking-tight mb-10">Quick Reference</h2>
          <TokenBlock />
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/30 py-10 px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <a href="/" className="flex items-center gap-2 hover:text-foreground transition-colors">
            <LogoMark className="size-4" />
            Ontograph
          </a>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/DaveHudson/Ontograph"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/DaveHudson/Ontograph/releases"
              className="hover:text-foreground transition-colors"
            >
              Changelog
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
