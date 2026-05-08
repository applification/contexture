# ADR 0021: varlock + Infisical for env and secrets management

- **Status:** Accepted
- **Date:** 2026-05-08

## Context

The repo spans three surfaces — `.sandcastle`, `apps/desktop`, and `apps/web` — each
needing a different set of runtime secrets (Sentry DSN, PostHog key, Infisical
credentials). The old approach used `.env.example` files: they documented which
variables were expected but provided no enforcement, no types, and no safe mechanism
for team members or CI to obtain real values without committing them to disk.

Problems with `.env.*` files in general:

- Secrets on disk are a persistent exfiltration risk (`git status` misses them,
  shell history captures them, and editors often index them).
- There is no schema, so a missing or misnamed variable fails at runtime with
  cryptic errors rather than at startup.
- Per-environment values (dev / staging / prod) require duplicating multiple files.

## Decision

Use **varlock** (schema-first env management) backed by **Infisical** (secret store).

Each surface declares its environment in a committed `.env.schema` file:

| Surface | Schema |
|---|---|
| `apps/desktop` | [`apps/desktop/.env.schema`](../../apps/desktop/.env.schema) |
| `apps/web` | [`apps/web/.env.schema`](../../apps/web/.env.schema) |
| `.sandcastle` | [`.sandcastle/.env.schema`](../../.sandcastle/.env.schema) |

Schema annotations (e.g. `@type`, `@sensitive`, `@defaultRequired`) are processed
by varlock; values tagged `infisical()` are fetched at startup from Infisical rather
than read from the file system. Generated `env.d.ts` files (via `@generateTypes`)
give TypeScript full type coverage for every declared variable.

**Infisical project:** `1b05b542-9803-44ab-89fe-eee9e57cf4eb` on
`https://eu.infisical.com`. Three environments map to `INFISICAL_ENV`:
`dev` (local), `staging` (CI), `prod` (release builds).

**CI** uses the `dmno-dev/varlock-action` GitHub Action to resolve secrets before
build and test steps. The action receives `INFISICAL_CLIENT_ID` and
`INFISICAL_CLIENT_SECRET` from GitHub repository secrets; the `INFISICAL_ENV`
value is set to `staging` for quality/e2e jobs and `prod` for release builds.

**Leak detection:** `bun run env:scan` (aliased to `varlock scan`) runs at the end
of `bun run ci` to reject any plaintext secret that drifted into the tree.

### Developer workflow

```bash
# Resolve secrets for a surface (authenticates via Infisical, writes no disk files)
cd apps/web && bunx varlock load

# Local override without touching Infisical (e.g. to test a different DSN)
# Create a gitignored .env.local next to the schema; varlock reads it first.
echo 'SENTRY_DSN=http://localhost' > apps/web/.env.local
```

AI coding agents read `.env.schema` files freely — they are metadata, not secrets.
Agents must never invent or hard-code secret values; if a value is missing they fail
loudly so a human can populate Infisical.

## Consequences

- Secrets are never written to disk or committed to the repo.
- Schema enforcement means a missing or mistyped variable fails at process startup
  with a clear error message, not at the first call that uses it.
- TypeScript types for env variables are generated automatically; no manual `process.env.X as string` casts needed.
- Three Infisical environments (`dev`, `staging`, `prod`) handle per-env secret
  values without duplicated files.
- `varlock scan` in CI catches accidental plaintext leaks before they merge.
- New secrets require updating the relevant `.env.schema` and adding the value to
  Infisical. No `.env.example` to keep in sync.

## Alternatives considered

- **Plain `.env.*` files:** simple but secrets on disk, no schema, no
  per-env separation without multiple files.
- **dotenvx:** encrypted `.env` on disk; encryption key still needs a distribution
  mechanism, and the file is still present on disk.
- **1Password `op run`:** good secret store but couples the toolchain to 1Password;
  Infisical is self-hostable, has a free tier, and varlock integrates natively.
- **Secrets only in CI:** would leave local development with hard-coded stubs or
  no secrets at all, making it impossible to test production-equivalent integrations
  locally.
