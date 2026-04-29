# Contexture

Visual Zod schema editor with LLM support. Chat to Claude about a domain;
Claude edits a closed-world schema via a small op vocabulary; the graph
animates per op. Generate `.schema.ts` (Zod) and `.schema.json` alongside
the source-of-truth `.contexture.json` for downstream products to import.

Built for engineers shipping LLM structured-output pipelines.

## Repository Structure

This is a Turborepo monorepo:

| App / Package | Path | Description | Deployment |
|---|---|---|---|
| **Desktop** | [`apps/desktop/`](apps/desktop/) | Electron schema editor | GitHub Releases (tagged) |
| **Web** | [`apps/web/`](apps/web/) | Marketing website (Next.js) | Vercel (auto-deploy on merge to main) |
| **stdlib** | [`packages/stdlib/`](packages/stdlib/) | Curated types library | — |
| **runtime** | [`packages/runtime/`](packages/runtime/) | Published as `@contexture/runtime` | npm |

## Prerequisites

- [Bun](https://bun.sh) (package manager)
- [Node.js](https://nodejs.org) 24+

## Getting Started

```bash
# Install dependencies
bun install

# Run all apps in dev mode
bun run dev

# Build all apps
bun run build

# Run tests
bun run test

# Type check
bun run typecheck

# Run all CI checks locally (typecheck + test + lint)
bun run ci
```

## Sandcastle (AI Night Shift)

Contexture uses [Sandcastle](https://github.com/ai-hero/sandcastle) to run
autonomous AI agents against the issue backlog. The idea is a **night shift /
day shift** workflow: Sandcastle works issues overnight in isolated Docker
sandboxes, and humans review the results during the day.

### How it works

The orchestration loop in [`.sandcastle/main.ts`](.sandcastle/main.ts) runs
up to 10 iterations, each with two phases:

1. **Eligibility (deterministic)** — [`pickEligible()`](.sandcastle/eligibility.ts)
   filters open issues by the `Sandcastle` label and excludes any already claimed
   by an open PR (via `Closes/Fixes/Resolves #N` in the PR body). When two or
   more candidates survive, a lightweight subset-selector agent picks a
   non-conflicting subset for parallel work; single-issue iterations skip the
   LLM round-trip entirely.
2. **Per-issue pipeline** — Each issue goes through
   [`runIssuePipeline()`](.sandcastle/pipeline.ts): a reconciliation check
   re-verifies live state (guards against issues closed or claimed while queued),
   then a Docker sandbox is created on a dedicated branch. An implementer agent
   writes the code, a reviewer agent stress-tests edge cases (skipped for
   docs-only diffs), and a PR-opener agent pushes the branch and opens a pull
   request linked to the issue. Pipelines run concurrently up to `MAX_PARALLEL`
   slots with retry on transient sandbox failures.

Humans review and merge the resulting PRs during the day. The merged PR
closes the issue via `Closes #N`. After each iteration, newly unblocked
issues are picked up in the next loop.

### Modules

| File | Role |
|---|---|
| [`main.ts`](.sandcastle/main.ts) | Iteration loop and orchestrator entry point |
| [`pipeline.ts`](.sandcastle/pipeline.ts) | Per-issue pipeline (implement → review → PR) |
| [`eligibility.ts`](.sandcastle/eligibility.ts) | Deterministic eligibility filtering |
| [`workflow.ts`](.sandcastle/workflow.ts) | Agent specs, labels, limits, and sandbox config |
| [`harness.ts`](.sandcastle/harness.ts) | Agent provider factory and stream logger |
| [`plan.ts`](.sandcastle/plan.ts) | Branch-name contract and `<plan>` tag parser |
| [`gh.ts`](.sandcastle/gh.ts) | GitHub CLI adapter (spawn + decode) |
| [`gh-parse.ts`](.sandcastle/gh-parse.ts) | Zod schemas and body parsing for `gh` output |
| [`concurrency.ts`](.sandcastle/concurrency.ts) | Bounded-parallelism semaphore |
| [`retry.ts`](.sandcastle/retry.ts) | Typed retry with backoff for sandbox creation |

### Prompt files

| File | Role |
|---|---|
| [`select-subset-prompt.md`](.sandcastle/select-subset-prompt.md) | Conflict-avoidance subset selection (2+ candidates only) |
| [`implement-prompt.md`](.sandcastle/implement-prompt.md) | TDD implementation with `RALPH:` commit convention |
| [`implement-docs-prompt.md`](.sandcastle/implement-docs-prompt.md) | Lighter implementer for documentation-only issues |
| [`review-prompt.md`](.sandcastle/review-prompt.md) | Code review, edge-case testing, quality pass |
| [`pr-prompt.md`](.sandcastle/pr-prompt.md) | Push branch and open the pull request |
| [`CODING_STANDARDS.md`](.sandcastle/CODING_STANDARDS.md) | Style and testing standards agents must follow |

### Running Sandcastle

```bash
# Build the Docker image (first time / after Dockerfile changes)
bun run sandcastle:build

# Run the orchestration loop
bun run sandcastle
```

Requires `ANTHROPIC_API_KEY` and `GH_TOKEN` environment variables — see
[`.sandcastle/.env.example`](.sandcastle/.env.example).

## Tech Stack

- **Monorepo**: Turborepo, Bun workspaces
- **Desktop**: Electron 35, React 19, TypeScript, Vite, Zustand, React Flow, Claude Agent SDK, Zod
- **Web**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **AI Night Shift**: Sandcastle, Claude Code, Docker

## License

MIT
