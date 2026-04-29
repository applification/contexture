// Single source of truth for sandcastle harness configuration.
//
// Values that historically lived inline in main.ts and were duplicated into
// prompt files. Pulling them here means changing model/effort/labels happens
// in one place; prompts receive the values via promptArgs.

// ---------- Tracker conventions ----------

// GitHub label used to opt issues into the Sandcastle workflow.
export const LABEL = "Sandcastle";

// Branch name template the planner must follow for each issue. The {number}
// and {slug} placeholders are filled by the planner (or, post-B.1, by
// pickEligible()). Validated against a regex in plan.ts at parse time.
export const BRANCH_FORMAT = "sandcastle/issue-{number}-{slug}";

// ---------- Orchestrator limits ----------

export const MAX_ITERATIONS = 10;
export const MAX_PARALLEL = 4;

// ---------- Sandbox setup ----------

// Skip host->worktree copy: this monorepo's node_modules is ~3.5GB and
// blows past sandcastle's hard-coded 60s copy timeout. The implementer
// sandbox runs `bun install` inside the container instead.
// Env files are gitignored, so copy them in explicitly.
export const COPY_TO_WORKTREE: readonly string[] = [
  "apps/desktop/.env",
  "apps/web/.env.local",
];

// Verify the install actually produced a usable workspace. `bun install` exits
// 0 even when individual extractions are mangled, so we follow with `turbo
// typecheck`, which resolves and loads imports across every workspace and
// fails loudly if a package's main entry is missing.
export const INSTALL_AND_VERIFY = "bun install && bun run typecheck";

// ---------- Agent specs ----------

export type AgentSpec = {
  model: string;
  effort?: "low" | "medium" | "high";
  promptPath: string;
};

// Each agent is keyed by purpose. Control flow (which agent runs when, the
// docs-only branching, the conditional reviewer skip) stays in main.ts —
// only the agent invocation parameters live here.
export const AGENTS = {
  planner: {
    model: "claude-opus-4-6",
    effort: "high",
    promptPath: "./.sandcastle/plan-prompt.md",
  },
  implementer: {
    model: "claude-opus-4-6",
    promptPath: "./.sandcastle/implement-prompt.md",
  },
  implementerDocs: {
    model: "claude-opus-4-6",
    promptPath: "./.sandcastle/implement-docs-prompt.md",
  },
  reviewer: {
    model: "claude-opus-4-6",
    promptPath: "./.sandcastle/review-prompt.md",
  },
  prOpener: {
    model: "claude-opus-4-6",
    effort: "low",
    promptPath: "./.sandcastle/pr-prompt.md",
  },
} as const satisfies Record<string, AgentSpec>;

export type AgentKey = keyof typeof AGENTS;
