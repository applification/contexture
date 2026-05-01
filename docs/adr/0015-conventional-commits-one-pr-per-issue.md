# ADR 0015: Conventional commits and one PR per issue

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Two contributor populations work in this repo: humans and Sandcastle's AFK agents. Both need a uniform commit/PR convention so:

- The history is greppable for `feat:` / `fix:` / `chore:` slices.
- Each merged PR closes exactly one tracked issue, so the issue tracker is the canonical "what did we ship" log.
- Reviewers can see the full intent of a change in one PR rather than scrolling across stacked PRs that reference each other.
- Sandcastle's `Closes #N` body parser has a single, deterministic rule for which issue a PR claims (see ADR 0018).

## Decision

- Conventional Commits for commit subjects (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).
- One PR per issue. Multiple commits inside the PR are fine and encouraged when they tell a coherent story.
- No stacked PRs. If a change must depend on another, land the dependency first.

## Consequences

- The git log reads as a stream of intent-tagged units.
- The issue tracker and the merged-PR list are always in 1:1 correspondence.
- Sandcastle's eligibility filter (`pickEligible`) can rely on `Closes/Fixes/Resolves #N` parsing to know whether an issue is already claimed.
- Cost: occasionally a logically-stacked change has to be reordered to land sequentially. Worth it for the simpler review surface.

## Alternatives considered

- **Stacked PRs (Graphite/Pierre style):** powerful but adds tooling cost and complicates the AFK-agent claim model.
- **Free-form commit messages:** loses the changelog-by-grep benefit.
- **Squash everything to one commit per PR:** loses the in-PR commit story; some refactor PRs are easier to review as a sequence.
