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

Phase 2 of the pivot adds `packages/stdlib` (curated types) and
`packages/runtime` (published as `@contexture/runtime`). See
[`plans/pivot.md`](plans/pivot.md) for the full plan.

## Prerequisites

- [Bun](https://bun.sh) (package manager)
- [Node.js](https://nodejs.org) 18+

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
```

## Tech Stack

- **Monorepo**: Turborepo, Bun workspaces
- **Desktop**: Electron 35, React 19, TypeScript, Vite, Zustand, React Flow, Claude Agent SDK, Zod
- **Web**: Next.js 15, React 19, TypeScript, Tailwind CSS 4, shadcn/ui

## License

MIT
