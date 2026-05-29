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
  GitPullRequestArrow,
  ListChecks,
  PlugZap,
  RefreshCw,
  Shield,
  Undo2,
  Zap,
} from 'lucide-react';
import { DownloadButton } from '@/components/download-button';
import {
  HeroScreenshotMotion,
  MotionItem,
  MotionList,
  MotionSection,
  MotionStatusBadge,
} from '@/components/homepage-motion';
import { TrackedLink } from '@/components/tracked-link';
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

function HeroSideGraph() {
  const leftPaths = [
    'M -24 156 C 58 148, 116 112, 204 132 S 310 214, 392 190',
    'M -16 246 C 78 244, 134 294, 222 270 S 318 244, 406 286',
    'M 18 354 C 104 326, 168 360, 248 338 S 330 286, 418 312',
  ];
  const rightPaths = [
    'M 1464 146 C 1376 144, 1318 106, 1234 130 S 1124 222, 1042 190',
    'M 1456 254 C 1362 252, 1304 300, 1218 270 S 1122 244, 1032 288',
    'M 1422 358 C 1336 330, 1272 360, 1192 338 S 1112 288, 1024 314',
  ];
  const nodes = [
    [126, 118, 'primary'],
    [206, 132, 'accent'],
    [300, 204, 'primary'],
    [150, 296, 'primary'],
    [246, 270, 'accent'],
    [336, 256, 'primary'],
    [116, 330, 'accent'],
    [246, 338, 'primary'],
    [392, 312, 'accent'],
    [1314, 112, 'primary'],
    [1234, 130, 'accent'],
    [1136, 210, 'primary'],
    [1292, 298, 'primary'],
    [1218, 270, 'accent'],
    [1108, 252, 'primary'],
    [1324, 334, 'accent'],
    [1192, 338, 'primary'],
    [1048, 314, 'accent'],
  ] as const;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-8 z-0 hidden h-[64%] w-screen -translate-x-1/2 lg:block"
      viewBox="0 0 1440 520"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="hero-side-graph-left" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--border)" stopOpacity="0" />
          <stop offset="0.28" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="0.74" stopColor="var(--accent)" stopOpacity="0.26" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hero-side-graph-right" x1="1" x2="0" y1="0" y2="0">
          <stop offset="0" stopColor="var(--border)" stopOpacity="0" />
          <stop offset="0.28" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="0.74" stopColor="var(--accent)" stopOpacity="0.26" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <filter id="hero-side-graph-soften" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.35" />
        </filter>
      </defs>
      <g fill="none" strokeLinecap="round" strokeWidth="1.2" filter="url(#hero-side-graph-soften)">
        {leftPaths.map((path) => (
          <path key={path} d={path} stroke="url(#hero-side-graph-left)" />
        ))}
        {rightPaths.map((path) => (
          <path key={path} d={path} stroke="url(#hero-side-graph-right)" />
        ))}
      </g>
      <g>
        {nodes.map(([cx, cy, tone]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r="4"
            fill={`var(--${tone})`}
            opacity={tone === 'accent' ? '0.36' : '0.26'}
          />
        ))}
      </g>
    </svg>
  );
}

const features = [
  {
    icon: GitGraph,
    title: 'Convex model editor',
    description:
      'Map Convex tables, object types, enums, refs, stdlib types, and constraints in a desktop workspace backed by source-of-truth `.contexture.json`.',
  },
  {
    icon: Database,
    title: 'Convex schema and validators',
    description:
      'Preview and emit `convex/schema.ts` and `convex/validators.ts` from table types, refs, and indexes before the files land in git.',
  },
  {
    icon: PlugZap,
    title: 'Built-in MCP server',
    description:
      'Give Codex, Claude, and other MCP clients tools to inspect models, apply constrained ops, emit targets, validate, and check drift.',
  },
  {
    icon: FileCode2,
    title: 'Supporting contracts',
    description:
      'Keep Zod, JSON Schema, schema indexes, structured-output schemas, MCP definitions, and form validators aligned with the Convex model.',
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
    label: 'Read Users and Teams tables',
    status: 'complete',
  },
  {
    tool: 'apply_contexture_op',
    label: 'Add Memberships table with user and team refs',
    status: 'complete',
  },
  { tool: 'emit_contexture', label: 'Regenerate Convex schema and validators', status: 'complete' },
  {
    tool: 'check_contexture_drift',
    label: 'Manifest clean',
    status: 'clean',
  },
];

const trustedLoopSteps = [
  {
    icon: GitGraph,
    title: 'Model',
    description:
      'Create Convex tables, refs, enums, indexes, and stdlib-backed fields on the graph.',
  },
  {
    icon: FileCode2,
    title: 'Emit',
    description: 'Preview and write `convex/schema.ts` and `convex/validators.ts` from the IR.',
  },
  {
    icon: Shield,
    title: 'Verify',
    description:
      'Use the generated manifest to prove every emitted target still matches the model.',
  },
  {
    icon: Bot,
    title: 'Supervise',
    description:
      'Let agents propose constrained model ops, then review validation, diffs, and undo.',
  },
  {
    icon: GitPullRequestArrow,
    title: 'Reconcile',
    description:
      'When generated files change outside Contexture, choose whether IR or disk should win.',
  },
];

type SyntaxKind =
  | 'function'
  | 'identifier'
  | 'keyword'
  | 'module'
  | 'plain'
  | 'property'
  | 'punctuation'
  | 'string';

type SyntaxPart = {
  kind?: SyntaxKind;
  key: string;
  text: string;
};

type ConvexPreviewLine = {
  id: string;
  parts: SyntaxPart[];
};

let syntaxPartId = 0;

function token(text: string, kind: SyntaxKind = 'plain'): SyntaxPart {
  syntaxPartId += 1;
  return { key: `${kind}-${syntaxPartId}`, text, kind };
}

const convexPreviewLines = [
  {
    id: 'server-import',
    parts: [
      token('import', 'keyword'),
      token(' { ', 'punctuation'),
      token('defineSchema', 'function'),
      token(', ', 'punctuation'),
      token('defineTable', 'function'),
      token(' } ', 'punctuation'),
      token('from', 'keyword'),
      token(' ', 'plain'),
      token('"convex/server"', 'module'),
      token(';', 'punctuation'),
    ],
  },
  {
    id: 'values-import',
    parts: [
      token('import', 'keyword'),
      token(' { ', 'punctuation'),
      token('v', 'identifier'),
      token(' } ', 'punctuation'),
      token('from', 'keyword'),
      token(' ', 'plain'),
      token('"convex/values"', 'module'),
      token(';', 'punctuation'),
    ],
  },
  { id: 'spacer-imports', parts: [token(' ')] },
  {
    id: 'schema-open',
    parts: [
      token('export default', 'keyword'),
      token(' ', 'plain'),
      token('defineSchema', 'function'),
      token('({', 'punctuation'),
    ],
  },
  {
    id: 'users-open',
    parts: [
      token('  '),
      token('users', 'property'),
      token(': ', 'punctuation'),
      token('defineTable', 'function'),
      token('({', 'punctuation'),
    ],
  },
  {
    id: 'users-name',
    parts: [
      token('    '),
      token('name', 'property'),
      token(': ', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('string', 'function'),
      token('(),', 'punctuation'),
    ],
  },
  {
    id: 'users-email',
    parts: [
      token('    '),
      token('email', 'property'),
      token(': ', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('string', 'function'),
      token('(),', 'punctuation'),
    ],
  },
  {
    id: 'users-index',
    parts: [
      token('  }).', 'punctuation'),
      token('index', 'function'),
      token('(', 'punctuation'),
      token('"by_email"', 'string'),
      token(', ', 'punctuation'),
      token('["email"]', 'string'),
      token('),', 'punctuation'),
    ],
  },
  {
    id: 'teams-open',
    parts: [
      token('  '),
      token('teams', 'property'),
      token(': ', 'punctuation'),
      token('defineTable', 'function'),
      token('({', 'punctuation'),
    ],
  },
  {
    id: 'teams-slug',
    parts: [
      token('    '),
      token('slug', 'property'),
      token(': ', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('string', 'function'),
      token('(),', 'punctuation'),
    ],
  },
  {
    id: 'teams-name',
    parts: [
      token('    '),
      token('name', 'property'),
      token(': ', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('string', 'function'),
      token('(),', 'punctuation'),
    ],
  },
  {
    id: 'teams-index',
    parts: [
      token('  }).', 'punctuation'),
      token('index', 'function'),
      token('(', 'punctuation'),
      token('"by_slug"', 'string'),
      token(', ', 'punctuation'),
      token('["slug"]', 'string'),
      token('),', 'punctuation'),
    ],
  },
  {
    id: 'memberships-open',
    parts: [
      token('  '),
      token('memberships', 'property'),
      token(': ', 'punctuation'),
      token('defineTable', 'function'),
      token('({', 'punctuation'),
    ],
  },
  {
    id: 'memberships-user',
    parts: [
      token('    '),
      token('userId', 'property'),
      token(': ', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('id', 'function'),
      token('(', 'punctuation'),
      token('"users"', 'string'),
      token('),', 'punctuation'),
    ],
  },
  {
    id: 'memberships-team',
    parts: [
      token('    '),
      token('teamId', 'property'),
      token(': ', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('id', 'function'),
      token('(', 'punctuation'),
      token('"teams"', 'string'),
      token('),', 'punctuation'),
    ],
  },
  {
    id: 'memberships-role',
    parts: [
      token('    '),
      token('role', 'property'),
      token(': ', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('union', 'function'),
      token('(', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('literal', 'function'),
      token('(', 'punctuation'),
      token('"owner"', 'string'),
      token('), ', 'punctuation'),
      token('v', 'identifier'),
      token('.', 'punctuation'),
      token('literal', 'function'),
      token('(', 'punctuation'),
      token('"member"', 'string'),
      token(')),', 'punctuation'),
    ],
  },
  { id: 'memberships-close', parts: [token('  })', 'punctuation')] },
  {
    id: 'memberships-user-index',
    parts: [
      token('    .', 'punctuation'),
      token('index', 'function'),
      token('(', 'punctuation'),
      token('"by_user"', 'string'),
      token(', ', 'punctuation'),
      token('["userId"]', 'string'),
      token(')', 'punctuation'),
    ],
  },
  {
    id: 'memberships-team-index',
    parts: [
      token('    .', 'punctuation'),
      token('index', 'function'),
      token('(', 'punctuation'),
      token('"by_team"', 'string'),
      token(', ', 'punctuation'),
      token('["teamId"]', 'string'),
      token('),', 'punctuation'),
    ],
  },
  { id: 'schema-close', parts: [token('});', 'punctuation')] },
] satisfies ConvexPreviewLine[];

const highlightedConvexLineIds = new Set([
  'memberships-open',
  'memberships-user',
  'memberships-team',
  'memberships-user-index',
  'memberships-team-index',
]);

function ConvexGeneratedPreview() {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card/70 text-left screenshot-glow">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/70 px-4 py-3">
        <div>
          <div className="font-mono text-xs text-primary dark:text-accent">convex/schema.ts</div>
          <div className="text-[11px] text-muted-foreground">Read-only generated output</div>
        </div>
        <MotionStatusBadge
          className="rounded border border-success/20 bg-success/10 px-2 py-1 text-[10px] uppercase tracking-wide text-success"
          delay={0.34}
        >
          Drift clean
        </MotionStatusBadge>
      </div>
      <pre className="max-w-full overflow-x-auto p-4 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
        <code>
          {convexPreviewLines.map((line, index) => (
            <span
              key={line.id}
              className={`block rounded-sm ${
                highlightedConvexLineIds.has(line.id) ? 'generated-line-highlight' : ''
              }`}
            >
              <span className="mr-4 select-none text-muted-foreground/40">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>
                {line.parts.map((part) => (
                  <span key={part.key} className={`syntax-token syntax-${part.kind ?? 'plain'}`}>
                    {part.text}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </code>
      </pre>
      <div className="border-t border-border/60 bg-background/50 px-4 py-3">
        <div className="font-mono text-xs text-primary dark:text-accent">convex/validators.ts</div>
        <p className="mt-1 text-xs text-muted-foreground break-words">
          Reusable validators emit beside the schema for functions, forms, and app boundaries.
        </p>
      </div>
    </div>
  );
}

function AgentTurnReviewDemo() {
  const reviewRows = [
    { label: 'Added table Memberships', status: 'applied' },
    { label: 'Added ref userId -> users', status: 'applied' },
    { label: 'Added index by_team', status: 'applied' },
    { label: 'Rejected duplicate table name Team', status: 'rejected' },
  ];

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-md border border-border/70 bg-card/70 text-left text-xs shadow-sm screenshot-glow">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-accent/10 text-accent flex items-center justify-center">
            <Bot className="size-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground">Agent turn review</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Codex · GPT-5.5 · committed
            </div>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-1 text-[11px] text-success sm:flex">
          <CircleDot className="size-3" />
          Drift clean
        </div>
      </div>

      <div className="grid gap-3 px-3 py-3 sm:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-2">
          <div className="rounded-md border border-border/70 bg-background/60 px-3 py-2.5">
            <p className="text-xs leading-5 text-foreground">
              Add a memberships table with refs to users and teams, emit the Convex files, and check
              drift.
            </p>
          </div>
          <MotionList
            className="overflow-hidden rounded-md border border-border/70 bg-background/60"
            trigger="mount"
          >
            {agentSteps.map((step) => (
              <MotionItem
                key={step.tool}
                className="flex items-start gap-2.5 border-b border-border/50 px-2.5 py-2 text-xs last:border-b-0"
              >
                <div className="mt-0.5 size-4 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
                  <Check className="size-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] leading-4 text-primary dark:text-accent">
                    {step.tool}
                  </div>
                  <div className="text-[11px] leading-4 text-muted-foreground">{step.label}</div>
                </div>
              </MotionItem>
            ))}
          </MotionList>
        </div>

        <div className="rounded-md border border-border/70 bg-background/70 p-2.5">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-foreground">5 proposed model changes</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  committed
                </span>
                <span>3 applied</span>
                <span className="text-warning">1 rejected</span>
                <span>1 no-op</span>
              </div>
            </div>
            <MotionStatusBadge delay={0.45}>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                <Undo2 className="size-3" />
                Undo turn
              </button>
            </MotionStatusBadge>
          </div>
          <MotionList
            className="overflow-hidden rounded-md border border-border/70"
            trigger="mount"
          >
            {reviewRows.map((row) => (
              <MotionItem
                key={row.label}
                className="flex items-center justify-between gap-2 border-b border-border/50 bg-card/40 px-2.5 py-2 text-[11px] last:border-b-0"
              >
                <span className="min-w-0 truncate text-foreground">{row.label}</span>
                <span
                  className={
                    row.status === 'applied'
                      ? 'shrink-0 rounded border border-success/20 bg-success/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-success'
                      : 'shrink-0 rounded border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning'
                  }
                >
                  {row.status}
                </span>
              </MotionItem>
            ))}
          </MotionList>
          <div className="mt-2.5 rounded-md border border-primary/15 bg-primary/5 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
            Validation blocks unsafe ops before generated files are emitted.
          </div>
        </div>
      </div>
    </div>
  );
}

function TrustedLoopSection() {
  return (
    <MotionSection
      id="trusted-loop"
      className="relative py-16 sm:py-24 px-4 sm:px-8 border-t border-border/30"
    >
      <div className="relative max-w-5xl mx-auto">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm text-primary dark:text-accent font-medium mb-4 tracking-widest uppercase">
            The trusted loop
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            From model change to drift clean, with review at every boundary.
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Contexture works because every path leads back to the same source model: direct edits,
            generated Convex files, external changes, and agent-authored operations.
          </p>
        </div>

        <MotionList className="relative grid gap-3 sm:grid-cols-5">
          <div
            aria-hidden="true"
            className="trusted-loop-trace pointer-events-none hidden sm:block"
          />
          {trustedLoopSteps.map((step, index) => (
            <MotionItem
              key={step.title}
              className="relative z-10 rounded-xl border border-border/60 bg-card/50 p-5 transition-colors hover:border-primary/30"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <step.icon className="size-5 text-primary" />
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </MotionItem>
          ))}
        </MotionList>
      </div>
    </MotionSection>
  );
}

function ReconcileDemo() {
  const actions = [
    'Generated file changed outside Contexture',
    'Supported Convex edits become proposed IR ops',
    'Uncovered diff stays visible for review',
    'User chooses regenerate, apply ops, or leave dirty',
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 screenshot-glow">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="font-mono text-xs text-primary dark:text-accent">convex/schema.ts</div>
          <div className="text-xs text-muted-foreground">
            Generated file changed outside Contexture
          </div>
        </div>
        <MotionStatusBadge
          className="whitespace-nowrap rounded border border-warning/25 bg-warning/10 px-2 py-1 text-[10px] uppercase tracking-wide text-warning"
          delay={0.15}
        >
          Needs review
        </MotionStatusBadge>
      </div>
      <MotionList className="space-y-2">
        {actions.map((action, index) => (
          <MotionItem
            key={action}
            className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2.5 text-sm"
          >
            <div className="mt-0.5 size-5 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-[10px] font-semibold">
              {index + 1}
            </div>
            <span className="text-muted-foreground">{action}</span>
          </MotionItem>
        ))}
      </MotionList>
      <div className="mt-4 grid gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <RefreshCw className="size-4" />
          Regenerate from IR
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium text-muted-foreground"
        >
          <ListChecks className="size-4" />
          Apply selected ops
        </button>
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
        <div className="relative max-w-3xl mx-auto text-center pt-28 sm:pt-44 pb-12 sm:pb-16">
          <p className="animate-fade-in-up text-sm text-primary dark:text-accent font-medium mb-6 tracking-widest uppercase">
            Convex model editor + MCP server
          </p>
          <h1 className="animate-fade-in-up-delay-1 text-3xl sm:text-5xl font-bold tracking-tight leading-[1.15] mb-6">
            A source-of-truth Convex model your app and agents can share.
          </h1>
          <p className="animate-fade-in-up-delay-2 text-lg text-primary dark:text-accent font-medium mb-3">
            Visual editing, generated Convex schema and validators, and MCP tools from one IR.
          </p>
          <p className="animate-fade-in-up-delay-2 text-base text-muted-foreground max-w-xl mx-auto mb-12 leading-relaxed">
            Contexture is a desktop control plane for Convex app models. Design tables, refs, and
            indexes on a graph, emit the files your app imports, and let coding agents propose
            reviewable model changes instead of hand-editing generated files.
          </p>
          <div className="animate-fade-in-up-delay-2 mb-8 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 font-mono">
              convex/schema.ts
            </span>
            <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 font-mono">
              convex/validators.ts
            </span>
            <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-success">
              Drift clean
            </span>
          </div>
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
              event="trusted_loop_click"
              properties={{ location: 'hero' }}
              href="#trusted-loop"
              className="inline-flex items-center justify-center gap-2 border border-border w-full sm:w-auto px-6 py-2.5 sm:px-7 sm:py-3 rounded-lg font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              <ListChecks className="size-4" />
              See the trusted loop
            </TrackedLink>
          </div>
        </div>

        {/* Hero screenshot — perspective tilt for depth */}
        <div className="relative max-w-5xl mx-auto pb-16 sm:pb-32">
          <HeroSideGraph />
          <HeroScreenshotMotion
            className="animate-fade-in-up-delay-3 relative z-10 rounded-xl overflow-hidden border border-border/60 screenshot-glow transition-shadow duration-500"
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
            <div className="absolute bottom-5 right-5 hidden w-[360px] lg:block">
              <ConvexGeneratedPreview />
            </div>
          </HeroScreenshotMotion>
        </div>
      </section>

      <TrustedLoopSection />

      {/* Features */}
      <section
        id="features"
        className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30"
      >
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-12 sm:mb-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              The model boundary for Convex apps built with agents
            </h2>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto">
              Contexture gives humans a clear desktop surface and gives agents a narrow protocol.
              Both paths update the same IR, regenerate Convex schema and validators, and leave
              drift checks as evidence.
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
                alt="Contexture desktop app with a selected Convex model object and the properties panel showing fields, optional flags, and model-shape hints"
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
              Let agents propose reviewable Convex model changes.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              The MCP server exposes model inspection, validation, constrained mutation, emit, and
              drift checks. Agents can update Convex tables, refs, and indexes while generated files
              remain outputs, not the source of truth.
            </p>
          </div>

          <div className="mb-12 sm:mb-16">
            <AgentTurnReviewDemo />
          </div>

          {/* Two-column: generated surface preview + description */}
          <div className="grid min-w-0 sm:grid-cols-5 gap-8 sm:gap-12 items-center">
            <div className="min-w-0 sm:col-span-2">
              <ConvexGeneratedPreview />
            </div>
            <div className="min-w-0 sm:col-span-3 space-y-6">
              <h3 className="text-2xl font-bold tracking-tight">
                See generated Convex files before they land in git
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                The desktop app previews generated outputs beside the model graph, so Convex table
                and index changes are concrete before they become commits. Optional supporting
                outputs let each project choose only the contracts it needs.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Zap className="size-4 text-accent" />
                  </div>
                  <span className="min-w-0 text-muted-foreground">
                    Convex schema, validators, Zod, JSON Schema, structured output, MCP, and forms
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Shield className="size-4 text-accent" />
                  </div>
                  <span className="min-w-0 text-muted-foreground">
                    Manifest-backed drift checks for every emitted target
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="size-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Brain className="size-4 text-accent" />
                  </div>
                  <span className="min-w-0 text-muted-foreground">
                    MCP tools for agents that need to inspect, mutate, emit, and validate
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reconcile */}
      <section className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="relative max-w-5xl mx-auto grid min-w-0 gap-8 sm:grid-cols-5 sm:gap-12 items-center">
          <div className="min-w-0 sm:col-span-3 space-y-6">
            <div className="inline-flex items-center gap-2 text-sm text-primary dark:text-accent font-medium px-4 py-1.5 rounded-full border border-accent/20 bg-accent/5">
              <GitPullRequestArrow className="size-4" />
              Reconcile as review
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Generated Convex files can drift. Contexture makes that reviewable.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              If an agent, teammate, or stale generator changes a Contexture-owned file, reconcile
              separates generated drift from source-model sync. For supported Convex schema edits,
              Contexture can propose IR operations; for everything else, the diff stays explicit and
              non-destructive.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-card/50 p-5">
                <h3 className="mb-2 text-sm font-semibold">IR stays the authority</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Re-emit generated files from the model, or accept supported changes back into the
                  IR through reviewable ops.
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/50 p-5">
                <h3 className="mb-2 text-sm font-semibold">Dirty can be intentional</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Leave a generated file dirty when you are still investigating. Contexture keeps
                  the state visible instead of silently resolving it.
                </p>
              </div>
            </div>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <ReconcileDemo />
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="relative py-16 sm:py-32 px-4 sm:px-8 border-t border-border/30">
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              One Convex model, many consumers
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Contexture is deliberately narrow: it owns the Convex model boundary, then gets out of
              the way. Product code, agents, and supporting contracts consume generated artifacts.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-8">
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-primary dark:text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Convex app schemas
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Emit `convex/schema.ts`, `convex/validators.ts`, and supporting schema files for the
                product repo. Generated markers and the manifest make review and drift detection
                part of normal git flow.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-accent/30 transition-colors">
              <div className="text-primary dark:text-accent text-sm font-medium uppercase tracking-wider mb-4">
                Structured output
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate JSON Schema and structured-output definitions from the same Convex model
                your app imports. Prompt surfaces and app surfaces stay aligned.
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
            ship generated Convex schema and validators from the desktop app for macOS, Windows, and
            Linux.
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
