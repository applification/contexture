import Image from 'next/image'
import { Brain, GitGraph, Shield, Zap, Download, ArrowRight } from 'lucide-react'

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

const features = [
  {
    icon: GitGraph,
    title: 'Visual Graph Editor',
    description: 'See your ontology as a living graph. Drag, connect, explore.',
  },
  {
    icon: Brain,
    title: 'AI-Powered',
    description: 'Chat with Claude to build and refine ontologies in natural language.',
  },
  {
    icon: Shield,
    title: 'Standards-First',
    description: 'Native OWL/RDF/Turtle support. No vendor lock-in.',
  },
  {
    icon: Zap,
    title: 'Real-Time Validation',
    description: 'Catch reasoning errors before they propagate.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">Ontograph</span>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="https://github.com/DaveHudson/Ontograph" className="hover:text-foreground transition-colors flex items-center gap-1.5">
              <GithubIcon className="size-4" />
              GitHub
            </a>
            <a
              href="#download"
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Download
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-8">
        {/* Gradient orbs */}
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/[0.07] blur-[100px] animate-float-slow pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/[0.05] blur-[100px] animate-float-slower pointer-events-none" />

        {/* Dot grid background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative max-w-3xl mx-auto text-center pt-44 pb-16">
          <p className="animate-fade-in-up text-sm text-muted-foreground mb-6 tracking-widest uppercase font-medium">
            Open source ontology editor
          </p>
          <h1 className="animate-fade-in-up-delay-1 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15] mb-8">
            Building ontologies shouldn&apos;t feel like writing XML in a{' '}
            <span className="text-muted-foreground">2005 Java app.</span>
          </h1>
          <p className="animate-fade-in-up-delay-2 text-lg text-accent font-medium mb-3">
            Where knowledge takes shape.
          </p>
          <p className="animate-fade-in-up-delay-2 text-base text-muted-foreground max-w-xl mx-auto mb-12 leading-relaxed">
            A modern, AI-powered ontology editor with visual graph editing,
            real-time validation, and Claude integration.
          </p>
          <div className="animate-fade-in-up-delay-3 flex items-center justify-center gap-4">
            <a
              href="#download"
              className="inline-flex items-center gap-2 bg-primary text-white px-7 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="size-4" />
              Download for free
            </a>
            <a
              href="https://github.com/DaveHudson/Ontograph"
              className="inline-flex items-center gap-2 border border-border px-7 py-3 rounded-lg font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <GithubIcon className="size-4" />
              View on GitHub
            </a>
          </div>
        </div>

        {/* Hero screenshot */}
        <div className="relative max-w-5xl mx-auto pb-32">
          <div className="animate-fade-in-up-delay-3 relative rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
            <Image
              src="/images/hero-graph.png"
              alt="Ontograph visual graph editor showing an ontology with interconnected classes and properties"
              width={1920}
              height={1080}
              className="w-full h-auto"
              priority
            />
            {/* Bottom fade to background */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-32 px-8 border-t border-border/30">
        {/* Subtle gradient orb */}
        <div className="absolute top-1/2 left-0 w-[300px] h-[300px] rounded-full bg-primary/[0.04] blur-[80px] animate-float-slower pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              Everything you need to model knowledge
            </h2>
            <p className="text-muted-foreground text-base">
              Built for ontology engineers, knowledge architects, and AI researchers.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border/60 bg-card/50 p-8 hover:border-primary/30 transition-colors"
              >
                <div className="size-11 rounded-lg bg-primary/10 flex items-center justify-center mb-5">
                  <feature.icon className="size-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Feature screenshots: graph detail + node properties side by side */}
          <div className="mt-20 grid sm:grid-cols-2 gap-6">
            <div className="rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <Image
                src="/images/graph-detail.png"
                alt="Ontograph graph editor showing zoomed-in class hierarchy with properties and relationships"
                width={1920}
                height={1080}
                className="w-full h-auto"
              />
            </div>
            <div className="rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <Image
                src="/images/node-properties.png"
                alt="Ontograph node properties panel showing class details, labels, and relationships"
                width={1920}
                height={1080}
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="relative py-32 px-8 border-t border-border/30">
        {/* Gradient orbs */}
        <div className="absolute top-1/3 right-0 w-[400px] h-[400px] rounded-full bg-accent/[0.04] blur-[100px] animate-float-slow pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[350px] h-[350px] rounded-full bg-primary/[0.05] blur-[80px] animate-float-slower pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 text-sm text-accent font-medium mb-6 px-4 py-1.5 rounded-full border border-accent/20 bg-accent/5">
              <Brain className="size-4" />
              Powered by Claude
            </div>
            <h2 className="text-3xl font-bold tracking-tight mb-5">
              Describe what you need. Watch it build.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Chat with Claude to create classes, properties, and relationships in natural language.
              The AI understands OWL semantics and can suggest refinements, find inconsistencies,
              and help you think through your domain model.
            </p>
          </div>

          {/* AI screenshots: Claude integration + validation side by side */}
          <div className="grid sm:grid-cols-2 gap-6 mb-16">
            <div className="rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <Image
                src="/images/claude-integration.png"
                alt="Ontograph Claude integration showing AI-powered ontology building with Claude Max"
                width={1920}
                height={1080}
                className="w-full h-auto"
              />
            </div>
            <div className="rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500">
              <Image
                src="/images/ai-validation.png"
                alt="Ontograph AI validation scoring an ontology at 72 out of 100 with coverage analysis"
                width={1920}
                height={1080}
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Chat example */}
          <div className="max-w-3xl mx-auto rounded-xl border border-border/60 bg-card/30 p-8 text-left font-mono text-sm leading-relaxed">
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

      {/* Download */}
      <section id="download" className="relative py-32 px-8 border-t border-border/30">
        {/* Gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.06] blur-[120px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Get Ontograph
          </h2>
          <p className="text-muted-foreground mb-10">
            Free and open source. Available for macOS, Windows, and Linux.
          </p>
          <a
            href="https://github.com/DaveHudson/Ontograph/releases/latest"
            className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3.5 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="size-4" />
            Download latest release
            <ArrowRight className="size-4" />
          </a>
          <p className="text-xs text-muted-foreground mt-6">
            MIT License. Requires macOS 12+, Windows 10+, or Ubuntu 20.04+.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-10 px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>Ontograph</span>
          <div className="flex items-center gap-6">
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
