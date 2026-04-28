import { ArrowRight, Brain, Download, GitGraph, Layers, Network, Shield, Zap } from 'lucide-react';
import { TrackedLink } from '@/components/tracked-link';
import { AnimatedGraph } from '@/components/ui/animated-graph';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { MobileNav } from '@/components/ui/mobile-nav';
import { ThemeImage } from '@/components/ui/theme-image';

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

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

const features = [
  {
    icon: GitGraph,
    title: 'Visual schema editor',
    description:
      'See every type as a node, every field as a sub-row, every ref as an edge. Drag, select, and refine your schema on an interactive canvas.',
  },
  {
    icon: Brain,
    title: 'Chat-driven authoring',
    description:
      'Describe a domain and your LLM edits the schema via a small op vocabulary. Every turn animates on the graph so you can follow what changed.',
  },
  {
    icon: Network,
    title: 'Zod + JSON Schema outputs',
    description:
      '`.contexture.json` is the source of truth; `.schema.ts` and `.schema.json` are emitted alongside and git-checked for downstream products to import.',
  },
  {
    icon: Zap,
    title: 'Eval panel',
    description:
      'Generate sample data — realistic, minimal, edge-case, or adversarial — against any root type. Zod-validate the output and save fixtures.',
  },
  {
    icon: Shield,
    title: 'Curated stdlib',
    description:
      'Email, URL, UUID, Address, Money, PhoneE164 — 19 types across 5 namespaces, published as `@contexture/runtime` for your generated code to import.',
  },
  {
    icon: Layers,
    title: 'Open source & free',
    description:
      'MIT licensed and free forever. Built in the open by engineers who believe schema tooling should be accessible to everyone.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LogoMark className="size-6" />
            Contexture
          </span>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="/brand" className="hover:text-foreground transition-colors">
              Brand
            </a>
            <TrackedLink
              event="github_click"
              properties={{ location: 'nav' }}
              href="https://github.com/applification/contexture"
              className="hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <GithubIcon className="size-4" />
              GitHub
            </TrackedLink>
            <AnimatedThemeToggler className="size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors [&_svg]:size-4" />
            <TrackedLink
              event="hero_cta_click"
              properties={{ location: 'nav' }}
              href="#download"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download
            </TrackedLink>
          </div>
          <MobileNav />
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-4 sm:px-8">
        {/* Animated node graph background — hidden on mobile to reduce GPU work */}
        <div className="hidden sm:block">
          <AnimatedGraph />
        </div>

        {/* Gradient orbs */}
        <div className="hidden sm:block absolute top-20 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/[0.07] blur-[100px] animate-float-slow pointer-events-none" />
        <div className="hidden sm:block absolute top-40 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/[0.05] blur-[100px] animate-float-slower pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center pt-28 sm:pt-44 pb-12 sm:pb-16">
          <p className="animate-fade-in-up text-sm text-accent font-medium mb-6 tracking-widest uppercase">
            Visual Zod schema editor with LLM support
          </p>
          <h1 className="animate-fade-in-up-delay-1 text-3xl sm:text-5xl font-bold tracking-tight leading-[1.15] mb-6">
            Design the schemas that power{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              your LLM pipelines.
            </span>
          </h1>
          <p className="animate-fade-in-up-delay-2 text-lg text-accent font-medium mb-3">
            Where schemas take shape.
          </p>
          <p className="animate-fade-in-up-delay-2 text-base text-muted-foreground max-w-xl mx-auto mb-12 leading-relaxed">
            Contexture pairs a visual graph editor with your choice of LLM — chat to describe a
            domain, watch the graph assemble, and emit Zod + JSON Schema your products can import
            directly.
          </p>
          <div className="animate-fade-in-up-delay-3 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <TrackedLink
              event="hero_cta_click"
              href="#download"
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground w-full sm:w-auto px-6 py-2.5 sm:px-7 sm:py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="size-4" />
              Download for free
            </TrackedLink>
            <TrackedLink
              event="github_click"
              properties={{ location: 'hero' }}
              href="https://github.com/applification/contexture"
              className="inline-flex items-center justify-center gap-2 border border-border w-full sm:w-auto px-6 py-2.5 sm:px-7 sm:py-3 rounded-lg font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <GithubIcon className="size-4" />
              View on GitHub
            </TrackedLink>
          </div>
        </div>

        {/* Hero screenshot — perspective tilt for depth */}
        <div className="relative max-w-5xl mx-auto pb-16 sm:pb-32">
          <div
            className="animate-fade-in-up-delay-3 relative rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500"
            style={{ perspective: '1200px' }}
          >
            <div style={{ transform: 'rotateX(2deg)', transformOrigin: 'bottom center' }}>
              <ThemeImage
                srcLight="/images/hero-graph-light.png"
                srcDark="/images/hero-graph.png"
                alt="Contexture visual schema editor showing connected types on a graph canvas with field-level ref edges"
                width={1600}
                height={1200}
                className="w-full h-auto"
                priority
              />
            </div>
            {/* Bottom fade */}
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30"
      >
        <div className="hidden sm:block absolute top-1/2 left-0 w-[300px] h-[300px] rounded-full bg-primary/[0.04] blur-[80px] animate-float-slower pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-12 sm:mb-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              The schema editor built for LLM pipelines
            </h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Design the closed-world schemas your structured-output prompts depend on. Built for
              engineers shipping products with any LLM — Claude, GPT, Gemini, and more.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-20">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-primary/30 hover:bg-card/80 transition-all duration-200"
              >
                <div className="size-11 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center mb-5 transition-colors">
                  <feature.icon className="size-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* Full-width app screenshot showing graph + properties panel */}
          <div className="rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
            <ThemeImage
              srcLight="/images/graph-detail-light.png"
              srcDark="/images/graph-detail.png"
              alt="Contexture showing the graph editor with a selected type and its detail panel editing field constraints"
              width={1600}
              height={1200}
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* AI Section — two-column layout with panel screenshot */}
      <section className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="hidden sm:block absolute top-1/3 right-0 w-[400px] h-[400px] rounded-full bg-accent/[0.04] blur-[100px] animate-float-slow pointer-events-none" />
        <div className="hidden sm:block absolute bottom-1/4 left-1/4 w-[350px] h-[350px] rounded-full bg-primary/[0.05] blur-[80px] animate-float-slower pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 text-sm text-accent font-medium mb-6 px-4 py-1.5 rounded-full border border-accent/20 bg-accent/5">
              <Brain className="size-4" />
              Multi-model AI
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5">
              Describe your domain.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                Watch your schema emerge.
              </span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Build schemas through conversation, not configuration. Your LLM edits via a small op
              vocabulary — add_type, add_field, set_discriminator, rename — so every turn is an
              atomic change you can undo or refine.
            </p>
          </div>

          {/* Two-column: AI validation panel + description */}
          <div className="grid sm:grid-cols-5 gap-8 sm:gap-12 items-center mb-12 sm:mb-16">
            <div className="sm:col-span-2 rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <ThemeImage
                srcLight="/images/ai-validation-light.png"
                srcDark="/images/ai-validation.png"
                alt="Eval panel generating sample data against a selected root type with Zod validation passing"
                width={478}
                height={1145}
                className="w-full h-auto"
              />
            </div>
            <div className="sm:col-span-3 space-y-6">
              <h3 className="text-2xl font-bold tracking-tight">Eval your schema with real data</h3>
              <p className="text-muted-foreground leading-relaxed">
                Pick a root type, pick a generation mode, and get a JSON sample that — by
                construction — parses against your schema. Test realism, edge cases, or adversarial
                input before you ship the prompt.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Zap className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">
                    Four modes: realistic, minimal, edge-case, adversarial
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Shield className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">
                    Post-generation Zod validation with field-level errors
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Brain className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">
                    Save fixtures alongside the schema for test reuse
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Chat example */}
          <div className="max-w-3xl mx-auto rounded-xl border border-border/60 bg-card/30 p-5 sm:p-8 text-left font-mono text-sm leading-relaxed">
            <div className="text-muted-foreground/70 text-xs uppercase tracking-wide mb-2">
              You:
            </div>
            <div className="text-foreground mb-6">
              Add a Harvest type for my allotment schema with a date, quantity (kg), and a ref to
              the Crop it came from.
            </div>
            <div className="text-accent/80 text-xs uppercase tracking-wide mb-2">AI:</div>
            <div className="text-muted-foreground">
              add_type Harvest (object) · add_field Harvest.date (date) · add_field
              Harvest.quantityKg (number, min=0) · add_field Harvest.crop (ref → Crop)
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="hidden sm:block absolute top-1/2 right-1/4 w-[350px] h-[350px] rounded-full bg-accent/[0.04] blur-[80px] animate-float-slow pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              Structured output is only as good as the schema behind it
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Contexture lets you design, visualise, and evaluate the closed-world schemas your LLM
              pipelines parse against.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-8">
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Structured output
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Emit Zod at build time; your prompt runner hands the same schema to any LLM —
                Claude, GPT, Gemini — for typed, validated responses. Parse failures become
                compile-time errors.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Data ingestion
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Shape what your LLM extracts from PDFs, emails, or transcripts. The IR ships in the
                prompt so every tool call targets a known, named type.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Shared models
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Reference types across projects with relative imports or pull from the curated
                `@contexture/runtime` stdlib. One schema, many products.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Download */}
      <section
        id="download"
        className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30"
      >
        <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.06] blur-[120px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-sm text-accent font-medium mb-4 tracking-widest uppercase">
            Open source & free
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Start designing your schemas
          </h2>
          <p className="text-muted-foreground mb-10">
            Free and open source. Available for macOS, Windows, and Linux.
          </p>
          <TrackedLink
            event="download_click"
            properties={{ os: 'unknown', location: 'footer_cta' }}
            href="/download"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="size-4" />
            Download latest release
            <ArrowRight className="size-4" />
          </TrackedLink>
          <p className="text-xs text-muted-foreground mt-6">
            MIT License. Requires macOS 12+, Windows 10+, or Ubuntu 20.04+.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 sm:py-10 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <LogoMark className="size-4" />
            Contexture
          </span>
          <div className="flex items-center gap-6">
            <a href="/brand" className="hover:text-foreground transition-colors">
              Brand
            </a>
            <a
              href="https://github.com/applification/contexture"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/applification/contexture/releases"
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
