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
up to 10 plan-execute-merge cycles:

1. **Plan** — A Claude Opus agent reads all open issues labelled `Sandcastle`,
   builds a dependency graph, and selects the unblocked issues that can be
   worked in parallel.
2. **Execute + Review** — For each issue, a Docker sandbox is created on its
   own branch. An implementer agent writes the code (up to 100 iterations),
   then a reviewer agent stress-tests edge cases and refines the work. All
   issue pipelines run concurrently.
3. **Merge** — A single agent merges all completed branches, resolves
   conflicts, and runs `bun run ci` to verify the result.

After each merge cycle, newly unblocked issues are picked up in the next
iteration.

### Prompt files

| File | Role |
|---|---|
| [`plan-prompt.md`](.sandcastle/plan-prompt.md) | Issue triage and dependency analysis |
| [`implement-prompt.md`](.sandcastle/implement-prompt.md) | TDD implementation with `RALPH:` commit convention |
| [`review-prompt.md`](.sandcastle/review-prompt.md) | Code review, edge-case testing, quality pass |
| [`merge-prompt.md`](.sandcastle/merge-prompt.md) | Branch merging and conflict resolution |
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
