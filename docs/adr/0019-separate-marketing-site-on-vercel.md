# ADR 0019: Marketing site is a separate Next.js app, deployed to Vercel

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The marketing site and the desktop editor are different products with different release cadences, different deploy targets, and different audiences. The marketing site needs SEO, fast TTFB, and continuous deploy; the editor needs signed binaries on tagged releases.

Coupling them — for example, building the marketing site as part of the Electron bundle, or running marketing pages inside the editor's web stack — creates accidental complexity (one CI failure blocks both, dependency upgrades have to satisfy both).

## Decision

`apps/web` is a standalone Next.js 16 app. Auto-deploys to Vercel on merge to `main`. The desktop app (`apps/desktop`) is independent: tagged releases publish to GitHub Releases via electron-builder.

The two apps share the design tokens defined in `DESIGN.md` (OKLCH palette, Geist typography, shadcn patterns) but each renders them with its own Tailwind config — no shared component library between them. Shared substance (IR, runtime, stdlib) lives in `packages/*`.

## Consequences

- Marketing changes ship in minutes via Vercel preview + merge; editor changes ship on a release cadence.
- Each app upgrades dependencies on its own schedule.
- Cost: divergence risk on visual design. Mitigated by `DESIGN.md` being canonical and reviewed when either app changes its tokens.

## Alternatives considered

- **One Next.js app that also hosts the editor as a web build:** loses filesystem and process-spawning capabilities the editor needs (see ADR 0004).
- **Marketing pages inside the Electron renderer:** users would have to install the editor to read landing copy.
- **Shared component package between web and desktop:** premature — the two apps' UI surfaces overlap less than expected, and the design tokens are the actual shared substance.
