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

`dev` runs Next.js through [Portless](https://portless.sh) so each git
worktree gets its own stable URL with no port conflicts. Portless is a
`devDependency`, so a normal `bun install` covers it.

Main worktree resolves to `http://web.localhost:1355` (name inferred from
`package.json`). Linked git worktrees auto-prepend the branch as a subdomain,
e.g. `http://issue-208.web.localhost:1355`. Portless assigns an ephemeral
`PORT` and Next.js respects it.

To print the URL for the current worktree:

```bash
bunx portless get web
```

To bypass Portless for a one-off plain `next dev`:

```bash
PORTLESS=0 bun run dev
```

The Playwright e2e config bypasses the package script and runs `bunx next dev`
directly so test runners can manage the process on `http://localhost:3000`.

Optional: enable HTTP/2 + TLS once for faster page loads and no browser warnings:

```bash
bunx portless proxy start --https
```

## Deployment

Deploys automatically to Vercel on every merge to `main`. No tags or manual releases required.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with Turbopack |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run typecheck` | Run TypeScript checks |
