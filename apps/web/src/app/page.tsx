import {
  ArrowRight,
  Bot,
  Brain,
  Check,
  CircleDot,
  Database,
  Download,
  FileCode2,
  GitGraph,
  PlugZap,
  Shield,
  Sparkles,
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
    title: 'Desktop model editor',
    description:
      'Map object types, enums, refs, stdlib types, and constraints in a real desktop workspace backed by source-of-truth `.contexture.json`.',
  },
  {
    icon: PlugZap,
    title: 'Built-in MCP server',
    description:
      'Give Codex, Claude, and other MCP clients tools to inspect models, apply constrained ops, emit targets, validate, and check drift.',
  },
  {
    icon: FileCode2,
    title: 'Generated app contracts',
    description:
      'Preview and emit Zod, JSON Schema, Convex schemas, schema indexes, structured-output schemas, MCP definitions, and form validators.',
  },
  {
    icon: Bot,
    title: 'Agent-safe model changes',
    description:
      'AI changes go through a closed operation vocabulary, so a model edit stays reviewable, undoable, and tied to the IR.',
  },
  {
    icon: Shield,
    title: 'Manifest-backed drift checks',
    description:
      'Generated files carry a manifest so you can prove the repo still matches the model before a change ships.',
  },
  {
    icon: Database,
    title: 'Stdlib for real domains',
    description:
      'Reach for curated primitives like Email, ISODate, LatLng, Handle, money, contact, identity, and place types instead of rebuilding basics.',
  },
];

const agentSteps = [
  {
    tool: 'inspect_contexture',
    label: 'Read Release and generated targets',
    status: 'complete',
  },
  {
    tool: 'apply_contexture_op',
    label: 'Add optional discogsReleaseId field',
    status: 'complete',
  },
  {
    tool: 'emit_contexture',
    label: 'Regenerate Zod, JSON Schema, and MCP definitions',
    status: 'complete',
  },
  {
    tool: 'check_contexture_drift',
    label: 'Manifest clean',
    status: 'clean',
  },
];

function AgentConversationDemo() {
  return (
    <div className="max-w-4xl mx-auto rounded-xl border border-border/60 bg-card/40 overflow-hidden text-left screenshot-glow">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
            <Bot className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Contexture agent</div>
            <div className="text-xs text-muted-foreground">MCP tools connected</div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs text-success">
          <CircleDot className="size-3" />
          Drift clean
        </div>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-sm sm:max-w-[72%]">
            Add a Discogs release ID to my Release model, emit the app contracts, and check drift.
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-1 size-7 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-lg border border-border/60 bg-background/60 px-4 py-3">
              <p className="text-sm leading-relaxed text-foreground">
                I’ll update the source model first, regenerate the selected outputs, then verify the
                manifest so generated files stay disposable.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/60 p-2">
              {agentSteps.map((step) => (
                <div
                  key={step.tool}
                  className="flex items-start gap-3 rounded-md px-2.5 py-2 text-sm"
                >
                  <div className="mt-0.5 size-5 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
                    <Check className="size-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-primary dark:text-accent">
                      {step.tool}
                    </div>
                    <div className="text-xs text-muted-foreground">{step.label}</div>
                  </div>
                  <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {step.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-foreground">
              Done. The IR changed, generated targets were emitted, and drift is clean.
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 bg-background/50 p-3">
        <div className="flex items-end gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
          <div className="min-h-9 flex-1 text-sm text-muted-foreground flex items-center">
            Ask the agent to change your model...
          </div>
          <div
            aria-hidden="true"
            className="size-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center"
          >
            <ArrowRight className="size-4" />
          </div>
        </div>
      </div>
    </div>
  );
}

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
          <p className="animate-fade-in-up text-sm text-primary dark:text-accent font-medium mb-6 tracking-widest uppercase">
            Desktop app + MCP server
          </p>
          <h1 className="animate-fade-in-up-delay-1 text-3xl sm:text-5xl font-bold tracking-tight leading-[1.15] mb-6">
            A source-of-truth model your app and agents can share.
          </h1>
          <p className="animate-fade-in-up-delay-2 text-lg text-primary dark:text-accent font-medium mb-3">
            Visual editing, generated TypeScript contracts, and MCP tools from one IR.
          </p>
          <p className="animate-fade-in-up-delay-2 text-base text-muted-foreground max-w-xl mx-auto mb-12 leading-relaxed">
            Contexture is a desktop control plane for TypeScript domain models. Design the model on
            a graph, emit the contracts your app imports, and let coding agents work through a
            constrained MCP server instead of hand-editing generated files.
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
                srcLight="/images/misprint-graph-overview-light.png"
                srcDark="/images/misprint-graph-overview.png"
                alt="Contexture desktop app showing a graph of connected domain types with the Codex chat panel open"
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
              The model boundary for AI-native TypeScript apps
            </h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Contexture gives humans a clear desktop surface and gives agents a narrow protocol.
              Both paths update the same IR, regenerate the same outputs, and leave drift checks as
              evidence.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-20">
            {features.map((feature) => (
              <div
                key={feature.title}
                data-testid="feature-card"
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

          {/* Current desktop states: selected object properties + enum hover affordance */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <ThemeImage
                srcLight="/images/misprint-properties-light.png"
                srcDark="/images/misprint-properties.png"
                alt="Contexture desktop app with a selected Misprint object and the properties panel showing fields, optional flags, and model-shape hints"
                width={1600}
                height={1200}
                className="w-full h-auto"
              />
            </div>
            <div className="rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <ThemeImage
                srcLight="/images/misprint-enum-hover-light.png"
                srcDark="/images/misprint-enum-hover.png"
                alt="Contexture graph editor showing an enum hover card for ArtworkState with values and description"
                width={1600}
                height={1200}
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* AI Section — two-column layout with panel screenshot */}
      <section className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 text-sm text-primary dark:text-accent font-medium mb-6 px-4 py-1.5 rounded-full border border-accent/20 bg-accent/5">
              <Brain className="size-4" />
              MCP-native by design
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5">
              Let agents edit the model through typed operations.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              The MCP server exposes model inspection, validation, constrained mutation, emit, and
              drift checks. Agents can make useful schema changes while the generated files remain
              outputs, not the source of truth.
            </p>
          </div>

          <div className="mb-12 sm:mb-16">
            <AgentConversationDemo />
          </div>

          {/* Two-column: generated surface preview + description */}
          <div className="grid sm:grid-cols-5 gap-8 sm:gap-12 items-center">
            <div className="sm:col-span-2 rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <ThemeImage
                srcDark="/images/misprint-generated-zod.png"
                srcLight="/images/misprint-generated-zod-light.png"
                alt="Contexture schema panel previewing generated Zod source from the selected domain model"
                width={1600}
                height={1200}
                className="w-full h-auto"
              />
            </div>
            <div className="sm:col-span-3 space-y-6">
              <h3 className="text-2xl font-bold tracking-tight">
                See the generated surface before it lands in git
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                The desktop app previews each target beside the model graph, so schema changes are
                concrete before they become commits. Optional outputs let each project choose only
                the contracts it needs.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Zap className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">
                    Zod, JSON Schema, Convex, indexes, structured output, MCP, and forms
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
                    MCP tools for agents that need to inspect, mutate, emit, and validate
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              One model, many consumers
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Contexture is deliberately narrow: it owns the domain model boundary, then gets out of
              the way. Product code, agents, and databases consume generated artifacts.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-8">
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-primary dark:text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Structured output
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate JSON Schema and structured-output definitions from the same type graph your
                app imports. Prompt surfaces and TypeScript surfaces stay aligned.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-primary dark:text-accent text-sm font-medium uppercase tracking-wider mb-4">
                App schemas
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Emit Zod, Convex, and schema-index files for the product repo. Generated markers and
                the manifest make review and drift detection part of normal git flow.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-primary dark:text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Agent workflows
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Let Codex or Claude work through the Contexture MCP server instead of hand-editing
                generated files. Agents update the IR and report whether drift remains.
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
          <p className="text-sm text-primary dark:text-accent font-medium mb-4 tracking-widest uppercase">
            Open source & free
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Put your domain model under control
          </h2>
          <p className="text-muted-foreground mb-10">
            Free and open source. Build visually, wire the MCP server into your coding tools, and
            ship generated contracts from the desktop app for macOS, Windows, and Linux.
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
