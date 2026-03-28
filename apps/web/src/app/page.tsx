import Image from 'next/image'
import { Brain, GitGraph, Shield, Zap, Download, ArrowRight, Layers, Network } from 'lucide-react'
import { ThemeImage } from '@/components/ui/theme-image'
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler'
import { MobileNav } from '@/components/ui/mobile-nav'
import { TrackedLink } from '@/components/tracked-link'

function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <line x1="8" y1="24" x2="24" y2="24" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="24" x2="16" y2="8" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="24" y1="24" x2="16" y2="8" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="16" cy="8" r="3.5" fill="var(--primary)"/>
      <circle cx="8" cy="24" r="3.5" fill="var(--primary)"/>
      <circle cx="24" cy="24" r="3.5" fill="var(--accent)"/>
    </svg>
  )
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function AnimatedNodes() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1200 800"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Animated connection lines */}
      <line x1="200" y1="150" x2="450" y2="280" className="animate-edge-pulse" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.15" />
      <line x1="450" y1="280" x2="700" y2="180" className="animate-edge-pulse-delay" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.12" />
      <line x1="700" y1="180" x2="950" y2="320" className="animate-edge-pulse" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.12" />
      <line x1="450" y1="280" x2="350" y2="500" className="animate-edge-pulse-delay" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.1" />
      <line x1="700" y1="180" x2="850" y2="520" className="animate-edge-pulse" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.1" />
      <line x1="200" y1="150" x2="100" y2="400" className="animate-edge-pulse-delay" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.08" />
      <line x1="950" y1="320" x2="1100" y2="500" className="animate-edge-pulse" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.08" />
      <line x1="350" y1="500" x2="600" y2="600" className="animate-edge-pulse-delay" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.08" />
      <line x1="850" y1="520" x2="600" y2="600" className="animate-edge-pulse" stroke="var(--primary)" strokeWidth="1" strokeOpacity="0.08" />

      {/* Animated nodes — floating gently */}
      <circle cx="200" cy="150" r="6" fill="var(--primary)" fillOpacity="0.2" className="animate-node-float" />
      <circle cx="200" cy="150" r="3" fill="var(--primary)" fillOpacity="0.4" className="animate-node-float" />

      <circle cx="450" cy="280" r="8" fill="var(--accent)" fillOpacity="0.15" className="animate-node-float-delay" />
      <circle cx="450" cy="280" r="4" fill="var(--accent)" fillOpacity="0.35" className="animate-node-float-delay" />

      <circle cx="700" cy="180" r="7" fill="var(--primary)" fillOpacity="0.18" className="animate-node-float-slow" />
      <circle cx="700" cy="180" r="3.5" fill="var(--primary)" fillOpacity="0.35" className="animate-node-float-slow" />

      <circle cx="950" cy="320" r="5" fill="var(--accent)" fillOpacity="0.2" className="animate-node-float" />
      <circle cx="950" cy="320" r="2.5" fill="var(--accent)" fillOpacity="0.4" className="animate-node-float" />

      <circle cx="350" cy="500" r="5" fill="var(--primary)" fillOpacity="0.12" className="animate-node-float-delay" />
      <circle cx="350" cy="500" r="2.5" fill="var(--primary)" fillOpacity="0.25" className="animate-node-float-delay" />

      <circle cx="850" cy="520" r="6" fill="var(--accent)" fillOpacity="0.1" className="animate-node-float-slow" />
      <circle cx="850" cy="520" r="3" fill="var(--accent)" fillOpacity="0.2" className="animate-node-float-slow" />

      <circle cx="100" cy="400" r="4" fill="var(--primary)" fillOpacity="0.08" className="animate-node-float" />
      <circle cx="1100" cy="500" r="4" fill="var(--primary)" fillOpacity="0.08" className="animate-node-float-delay" />
      <circle cx="600" cy="600" r="5" fill="var(--accent)" fillOpacity="0.1" className="animate-node-float-slow" />
    </svg>
  )
}

const features = [
  {
    icon: GitGraph,
    title: 'Visual Graph Editor',
    description: 'See your ontology as a living, interactive graph. Drag nodes, draw connections, and explore complex hierarchies on an intuitive canvas.',
  },
  {
    icon: Brain,
    title: 'AI-First Creation',
    description: 'Build ontologies through conversation with an AI that understands OWL semantics. From natural language to formal ontology in minutes.',
  },
  {
    icon: Network,
    title: 'Built for the AI Stack',
    description: 'Create ontologies that plug into RAG pipelines, context graphs, and agent architectures. The missing tool between your data and your AI agents.',
  },
  {
    icon: Zap,
    title: 'AI-Powered Validation',
    description: 'AI-powered quality scoring catches gaps and inconsistencies as you build. Coverage, consistency, and completeness analysis in real time.',
  },
  {
    icon: Shield,
    title: 'Standards-First',
    description: 'Full OWL/RDF/Turtle support with zero vendor lock-in. Import existing ontologies, export to any format.',
  },
  {
    icon: Layers,
    title: 'Open Source & Free',
    description: 'MIT licensed and free forever. Built in the open by engineers who believe knowledge infrastructure should be accessible to everyone.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LogoMark className="size-6" />
            Ontograph
          </span>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="/brand" className="hover:text-foreground transition-colors">Brand</a>
            <TrackedLink event="github_click" properties={{ location: 'nav' }} href="https://github.com/DaveHudson/Ontograph" className="hover:text-foreground transition-colors flex items-center gap-1.5">
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
          <AnimatedNodes />
        </div>

        {/* Gradient orbs */}
        <div className="hidden sm:block absolute top-20 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/[0.07] blur-[100px] animate-float-slow pointer-events-none" />
        <div className="hidden sm:block absolute top-40 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/[0.05] blur-[100px] animate-float-slower pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center pt-28 sm:pt-44 pb-12 sm:pb-16">
          <p className="animate-fade-in-up text-sm text-accent font-medium mb-6 tracking-widest uppercase">
            The AI-native ontology editor
          </p>
          <h1 className="animate-fade-in-up-delay-1 text-3xl sm:text-5xl font-bold tracking-tight leading-[1.15] mb-6">
            Build the knowledge layer{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              your AI agents need.
            </span>
          </h1>
          <p className="animate-fade-in-up-delay-2 text-lg text-accent font-medium mb-3">
            Where knowledge takes shape.
          </p>
          <p className="animate-fade-in-up-delay-2 text-base text-muted-foreground max-w-xl mx-auto mb-12 leading-relaxed">
            Ontograph pairs a visual graph editor with AI that understands OWL — so you can create
            production-ready ontologies through natural language.
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
              href="https://github.com/DaveHudson/Ontograph"
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
                alt="Ontograph visual graph editor showing a People ontology with Person, Employee, Manager and Organisation classes connected by subClassOf and object property edges"
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
      <section id="features" className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="hidden sm:block absolute top-1/2 left-0 w-[300px] h-[300px] rounded-full bg-primary/[0.04] blur-[80px] animate-float-slower pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-12 sm:mb-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              The ontology editor built for the AI era
            </h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Create ontologies that ground your AI — not guesswork.
              Built for AI Product Engineers, knowledge architects, and anyone building the next generation of intelligent applications.
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
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Full-width app screenshot showing graph + properties panel */}
          <div className="rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
            <ThemeImage
              srcLight="/images/graph-detail-light.png"
              srcDark="/images/graph-detail.png"
              alt="Ontograph showing the graph editor with a selected Person node and its properties panel displaying class details, datatype properties, and relationships"
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
              Powered by Claude
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5">
              Describe your domain.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                Watch your ontology emerge.
              </span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Create the structured knowledge that powers reliable AI — through conversation, not configuration.
              The AI understands OWL semantics and can suggest refinements, find inconsistencies,
              and help you think through your domain model.
            </p>
          </div>

          {/* Two-column: AI validation panel + description */}
          <div className="grid sm:grid-cols-5 gap-8 sm:gap-12 items-center mb-12 sm:mb-16">
            <div className="sm:col-span-2 rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <ThemeImage
                srcLight="/images/ai-validation-light.png"
                srcDark="/images/ai-validation.png"
                alt="AI validation panel scoring an ontology at 78 out of 100 with coverage analysis and improvement suggestions"
                width={478}
                height={1145}
                className="w-full h-auto"
              />
            </div>
            <div className="sm:col-span-3 space-y-6">
              <h3 className="text-2xl font-bold tracking-tight">
                AI-powered quality scoring
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Get instant feedback on your ontology&apos;s quality. The validation engine
                scores coverage, consistency, and completeness — then suggests specific
                improvements you can queue for automated refinement.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Zap className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">Coverage analysis across all domain areas</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Shield className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">Consistency checks for vocabulary and class links</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Brain className="size-4 text-accent" />
                  </div>
                  <span className="text-muted-foreground">Actionable suggestions to improve your model</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chat example */}
          <div className="max-w-3xl mx-auto rounded-xl border border-border/60 bg-card/30 p-5 sm:p-8 text-left font-mono text-sm leading-relaxed">
            <div className="text-muted-foreground/70 text-xs uppercase tracking-wide mb-2">You:</div>
            <div className="text-foreground mb-6">
              Create an ontology for a university with students, courses, and professors.
              Students enroll in courses, professors teach courses.
            </div>
            <div className="text-accent/80 text-xs uppercase tracking-wide mb-2">Claude:</div>
            <div className="text-muted-foreground">
              I&apos;ll create the class hierarchy and object properties. Adding Person as a
              superclass of Student and Professor, with enrolledIn and teaches relationships...
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
              Your AI agents are only as smart as the knowledge behind them
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Ontograph lets you build, visualize, and validate the structured knowledge layer that makes AI reliable.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-8">
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">RAG Pipelines</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ontology-powered RAG delivers more precise retrieval than unstructured vector search.
                Build the knowledge graph that gives your AI the context it needs.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">AI Agents</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ground your AI agents in verified, typed knowledge. Eliminate hallucination and enable
                explainability with formal ontology structures.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-accent text-sm font-medium uppercase tracking-wider mb-4">Context Graphs</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create the structured context layer that powers intelligent applications.
                Export to OWL/RDF and plug directly into your AI stack.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.06] blur-[120px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-sm text-accent font-medium mb-4 tracking-widest uppercase">
            Open source & free
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Start building your knowledge layer
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
            Ontograph
          </span>
          <div className="flex items-center gap-6">
            <a href="/brand" className="hover:text-foreground transition-colors">
              Brand
            </a>
            <a href="https://github.com/DaveHudson/Ontograph" className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <a href="https://github.com/DaveHudson/Ontograph/releases" className="hover:text-foreground transition-colors">
              Changelog
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
