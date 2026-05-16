import {
  ArrowRight,
  Bot,
  Brain,
  Database,
  Download,
  GitGraph,
  Network,
  Shield,
  Zap,
} from 'lucide-react';
import { DownloadButton } from '@/components/download-button';
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
    title: 'Source-of-truth IR',
    description:
      'Keep `*.contexture.json` as the canonical domain model. The graph is an editor for the truth, not another drawing to keep in sync.',
  },
  {
    icon: Brain,
    title: 'Closed-world agent ops',
    description:
      'Codex and Claude change schemas through explicit Contexture operations, so every AI edit is reviewable, undoable, and constrained.',
  },
  {
    icon: Network,
    title: 'App-ready emit targets',
    description:
      'Emit Zod, JSON Schema, schema indexes, and Convex schemas from the same model, then commit the generated surface your app imports.',
  },
  {
    icon: Bot,
    title: 'Agent-ready surfaces',
    description:
      'Opt into provider-neutral AI tool schemas and expose the same model over MCP so coding agents can inspect, mutate, emit, and check drift.',
  },
  {
    icon: Shield,
    title: 'Drift you can trust',
    description:
      'Generated files carry a manifest. Contexture tells you when Zod, JSON Schema, Convex, or agent outputs no longer match the IR.',
  },
  {
    icon: Database,
    title: 'Dogfooded on real apps',
    description:
      'The workflow is already being used on Applification products: start from the IR, regenerate artifacts, and let drift checks prove it.',
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

        <div className="relative max-w-3xl mx-auto text-center pt-28 sm:pt-44 pb-12 sm:pb-16">
          <p className="animate-fade-in-up text-sm text-accent font-medium mb-6 tracking-widest uppercase">
            Domain-model control plane
          </p>
          <h1 className="animate-fade-in-up-delay-1 text-3xl sm:text-5xl font-bold tracking-tight leading-[1.15] mb-6">
            Design your domain once. Ship it everywhere.
          </h1>
          <p className="animate-fade-in-up-delay-2 text-lg text-accent font-medium mb-3">
            One model for your app, database, and agents.
          </p>
          <p className="animate-fade-in-up-delay-2 text-base text-muted-foreground max-w-xl mx-auto mb-12 leading-relaxed">
            Contexture turns a source-of-truth IR into Zod, JSON Schema, Convex schemas, MCP tools,
            and AI tool definitions. Humans and agents edit the same domain model; drift checks keep
            the emitted code honest.
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
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-12 sm:mb-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              The control plane for AI-native TypeScript apps
            </h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Model the domain once, then emit the contracts every runtime needs. Contexture keeps
              visual editing, agent mutation, generated code, and drift detection tied to one
              explicit source of truth.
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
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 text-sm text-accent font-medium mb-6 px-4 py-1.5 rounded-full border border-accent/20 bg-accent/5">
              <Brain className="size-4" />
              Agent-safe by design
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5">
              Let agents change the model, not the contract.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Contexture exposes a narrow mutation vocabulary through chat, CLI, and MCP. Codex or
              Claude can inspect a schema, apply one closed-world op, regenerate artifacts, and
              prove the repo is still clean.
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
              <h3 className="text-2xl font-bold tracking-tight">
                Emit contracts your pipeline can actually use
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                The same IR can serve product code, database definitions, structured output, and
                agent tools. Opt-in AI pipeline targets generate provider-neutral tool schemas
                without forcing a runtime choice.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Zap className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">
                    Zod, JSON Schema, schema indexes, and Convex schema from one IR
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Shield className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">
                    Manifest-backed drift checks for every emitted target
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Brain className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">
                    MCP access for agents that need to inspect, mutate, emit, and validate
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
              Add a Discogs release ID to my Release model and make it queryable.
            </div>
            <div className="text-accent/80 text-xs uppercase tracking-wide mb-2">AI:</div>
            <div className="text-muted-foreground">
              add_field Release.discogsReleaseId (string, optional) · add_index Release
              by_discogs_release_id · emit · check_generated clean
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              Ship every surface from the same domain model
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Contexture is deliberately narrow: it owns the model boundary, then gets out of the
              way. Your app, agent, and database code consume generated artifacts.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-8">
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Structured output
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate JSON Schema and AI tool definitions from the same type graph your app
                imports. The prompt surface and TypeScript surface stop drifting apart.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">
                App schemas
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Emit Zod and Convex schema files for the product repo. Generated markers and the
                manifest make review and drift detection part of normal git flow.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Agent workflows
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Let Codex or Claude work through CLI and MCP instead of hand-editing generated
                files. Agents update the IR, regenerate artifacts, and report whether drift remains.
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
        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-sm text-accent font-medium mb-4 tracking-widest uppercase">
            Open source & free
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Start with your source-of-truth model
          </h2>
          <p className="text-muted-foreground mb-10">
            Free and open source. Build visually, collaborate with agents, and ship generated
            contracts from the desktop app for macOS, Windows, and Linux.
          </p>
          <DownloadButton
            location="footer_cta"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="size-4" />
            Download latest release
            <ArrowRight className="size-4" />
          </DownloadButton>
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
            <a href="/changelog" className="hover:text-foreground transition-colors">
              Changelog
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
