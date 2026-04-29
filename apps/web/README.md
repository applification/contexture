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

Portless is a `devDependency` of this app, so a normal `bun install` is enough.

```bash
# Optional: HTTP/2 + TLS (faster page loads, no browser warnings)
bunx portless proxy start --https

# From apps/web
bun run dev:portless
```

Main worktree resolves to `http://web.localhost:1355` (name inferred from
`package.json`). Linked git worktrees auto-prepend the branch as a subdomain,
e.g. `http://issue-208.web.localhost:1355` — no per-worktree config needed.
Portless assigns an ephemeral `PORT` and Next.js respects it.

## Deployment

Deploys automatically to Vercel on every merge to `main`. No tags or manual releases required.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with Turbopack |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run typecheck` | Run TypeScript checks |
