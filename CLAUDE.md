## Tool discipline

Prefer dedicated tools over Bash for filesystem ops — `Read` over `cat`, `Glob` over `find`, `Grep` over `grep`/`rg`, `Edit`/`Write` over `sed`/heredocs. Bash is for tests, git, gh, package managers, builds.

## Orientation

Turborepo monorepo (Bun workspaces). See [README.md](README.md) for the app/package table and tech stack.

Coding standards live in [.sandcastle/CODING_STANDARDS.md](.sandcastle/CODING_STANDARDS.md) — they apply to all contributors, not just AFK agents. Read them before writing code.

## Commands

```bash
bun run dev         # all apps in dev mode (turbo)
bun run ci          # typecheck + test + biome check — run before pushing
bun run typecheck   # turbo typecheck
bun run test        # turbo test (Vitest)
bun run lint        # biome lint
bun run format      # biome format --write
```

Run a single test file: `cd packages/<pkg> && bun test path/to/file.test.ts`.

## CI

If CI fails on a pushed branch, fix it before merging.

## Commits

Use conventional commits.
