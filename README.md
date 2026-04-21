# Contexture

Create and maintain ontologies using natural language. Contexture is a visual OWL ontology editor powered by Claude AI, built for AI Researchers and AI Engineers.

## Repository Structure

This is a Turborepo monorepo with two apps:

| App | Path | Description | Deployment |
|-----|------|-------------|------------|
| **Desktop** | [`apps/desktop/`](apps/desktop/) | Electron desktop ontology editor | GitHub Releases (tagged) |
| **Web** | [`apps/web/`](apps/web/) | Marketing website (Next.js) | Vercel (auto-deploy on merge to main) |

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
- **Desktop**: Electron 35, React 19, TypeScript, Vite, Zustand, React Flow, Claude Agent SDK
- **Web**: Next.js 15, React 19, TypeScript, Tailwind CSS 4, shadcn/ui

## License

MIT
