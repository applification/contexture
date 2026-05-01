# ADR 0013: Biome instead of ESLint + Prettier

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Linting and formatting touch every file, every commit, every CI run. Speed matters. Configuration sprawl matters. The traditional ESLint + Prettier + plugins stack is slow on large repos, has overlapping responsibilities (formatting rules in both), and config files multiply across packages.

We also want hard rules — `noExplicitAny` as an error, not a warning — to be enforceable in one place.

## Decision

Use Biome as the single tool for both linting and formatting. One config (`biome.json`) at the repo root. Run via `bun run lint`, `bun run format`, `bun run check`. CI runs `biome check .` as the final step of `bun run ci`.

Hard rules: `noExplicitAny` is an error, `useImportType` is enforced (so `import type` discipline is mechanical, not aspirational). Style: 2-space indent, 100-char line width, single quotes, trailing commas.

## Consequences

- Lint + format completes in a fraction of the time ESLint+Prettier took.
- One config, one ignore file, one CLI. New contributors don't have to learn two tools.
- Lint-staged hooks via Husky run `biome check --write` on staged files only.
- Cost: a few ESLint plugins have no Biome equivalent yet. We've not hit a case that mattered.

## Alternatives considered

- **ESLint + Prettier + typescript-eslint:** slower, more config, two tools.
- **dprint + ESLint:** dprint is fast but doesn't lint; we'd still need ESLint.
- **No linter, just `tsc`:** misses style and import-discipline rules that catch real bugs and review churn.
