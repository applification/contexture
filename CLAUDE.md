## Tool discipline

Prefer dedicated tools over Bash for filesystem ops — `Read` over `cat`, `Glob` over `find`, `Grep` over `grep`/`rg`, `Edit`/`Write` over `sed`/heredocs. Bash is for tests, git, gh, package managers, builds.

## Orientation

Turborepo monorepo (Bun workspaces). See [README.md](README.md) for the app/package table and tech stack.

Coding standards live in [.sandcastle/CODING_STANDARDS.md](.sandcastle/CODING_STANDARDS.md) — they apply to all contributors, not just AFK agents. Read them before writing code.

## Business context (Obsidian vault)

Contexture is one product within Applification Ltd. Strategic direction, prior decisions, and curated business/engineering knowledge live in the Obsidian vault at `/Users/rufus/Documents/Applification Ltd` (single vault, name `Applification Ltd`). Access it via the local `obsidian` CLI through the [`applification-vault`](.claude/skills/applification-vault/SKILL.md) skill — read first before product/architecture planning; write only to `Products/Contexture/` and `log.md`, and only after the user has agreed a decision should be recorded.

**No lint suppressions.** Never write `biome-ignore` or `eslint-disable`. If a rule fires, fix the underlying code. `bun run ci` enforces this with the `check:no-suppressions` script in [package.json](package.json).

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

## Env vars

Real secret values **never** sit on disk in this repo. Each surface declares
its env in a committed `.env.schema` file ([apps/web](apps/web/.env.schema),
[apps/desktop](apps/desktop/.env.schema), [.sandcastle](.sandcastle/.env.schema));
values resolve at runtime from Infisical via [varlock](https://varlock.dev).

- AI agents may read `.env.schema` files freely — they're metadata, not secrets.
- Do not invent or guess secret values. If env is missing, fail loudly so a
  human can populate Infisical.
- `bun run env:scan` runs in CI to detect plaintext leaks. To debug a single
  schema during development, run `bunx varlock load` from that directory.
- Local override (rare, e.g. testing a different DSN): create a gitignored
  `.env.local` next to the schema; varlock reads it before calling Infisical.

## Commits

Use conventional commits.
