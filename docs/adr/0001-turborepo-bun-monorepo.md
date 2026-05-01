# ADR 0001: Turborepo monorepo with Bun workspaces

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Contexture ships a desktop editor (Electron), a marketing site (Next.js), a curated stdlib of reusable types, a thin runtime re-export package consumed by end users, and a CLI. These pieces share an IR, op vocabulary, and emitter pipeline. They also need to evolve together: an IR change touches core, the desktop renderer, and downstream emitted artefacts in lockstep.

A multi-repo split would force version-pinned releases between every layer, and every refactor that crosses a layer would become a coordinated multi-PR dance.

## Decision

Single repository organised as a Turborepo monorepo on Bun workspaces (`apps/*`, `packages/*`). Turbo orchestrates `dev`/`build`/`typecheck`/`test`; Bun is the package manager and test/script runner.

## Consequences

- Cross-cutting changes land atomically in one PR with one CI run.
- Turbo caches typecheck and test results per-package, so unrelated packages don't pay for each other's churn.
- Bun install speed is meaningfully faster than npm/pnpm in cold and warm cases, which matters for AFK Sandcastle runs that bootstrap fresh containers.
- Cost: contributors need Bun installed (Node 24 alone is not enough). Documented in the README prerequisites.
- Cost: tooling (some IDE plugins, some publish workflows) assumes npm — occasional friction.

## Alternatives considered

- **Multi-repo + npm/pnpm:** rejected because the IR/op vocabulary is genuinely shared and changes ripple across layers.
- **pnpm workspaces + Nx:** viable, but Bun is faster for our workload and Turbo's mental model is simpler than Nx's project graph.
- **npm workspaces + Turbo:** loses Bun's install/run speed without gaining anything.
