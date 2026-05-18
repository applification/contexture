# Agent Instructions

## Orientation

Contexture is a Turborepo monorepo using Bun workspaces. See [README.md](README.md) for the app/package table and tech stack.

Coding standards live in [.sandcastle/CODING_STANDARDS.md](.sandcastle/CODING_STANDARDS.md) and apply to all contributors.

## Commands

```bash
bun run dev         # all apps in dev mode (turbo)
bun run ci          # typecheck + test + biome check
bun run typecheck   # turbo typecheck
bun run test        # turbo test (Vitest)
bun run lint        # biome lint
bun run format      # biome format --write
```

Run a single test file from the package directory:

```bash
bun run test -- path/to/file.test.ts
```

Do not use `bun test`; this repo uses Vitest through package scripts.

## Quality

- Do not add lint suppressions such as `biome-ignore` or `eslint-disable`.
- If a rule fails, fix the underlying code.
- Run focused tests for local changes, and prefer `bun run ci` before pushing.

## Env Vars

Real secret values never sit on disk in this repo. Each surface declares env metadata in a committed `.env.schema` file. Do not invent or guess secret values; if env is missing, fail loudly so a human can populate Infisical.

## Commits

Use conventional commits.
