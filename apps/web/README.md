# @contexture/web

The Contexture marketing website built with Next.js.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (Turbopack) |
| UI | React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui |
| Fonts | Geist |
| Syntax Highlighting | Shiki |

## Development

```bash
# From the monorepo root
bun run dev

# Or directly
cd apps/web
bun run dev
```

### Portless (multi-worktree dev)

For running multiple worktrees in parallel (Conductor / Claude Code), use
[Portless](https://portless.sh) to get stable, named URLs instead of fighting
over port numbers.

```bash
# One-time global install
npm install -g portless

# From apps/web (uses portless.json -> name: "contexture")
portless bun run dev
```

Main worktree resolves to `https://contexture.localhost`. Other worktrees
auto-prepend the branch as a subdomain, e.g. `https://issue-208.contexture.localhost`.
Portless assigns a free `PORT` per run, which Next.js respects automatically.

## Deployment

Deploys automatically to Vercel on every merge to `main`. No tags or manual releases required.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with Turbopack |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run typecheck` | Run TypeScript checks |
