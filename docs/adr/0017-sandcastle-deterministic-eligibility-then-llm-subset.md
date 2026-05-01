# ADR 0017: Sandcastle uses deterministic eligibility, then an LLM subset selector only when needed

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Sandcastle runs an autonomous loop that picks issues from the backlog and ships PRs overnight. Two failure modes are expensive:

- Burning LLM cost on issues that aren't actually pickable (already claimed by an open PR, missing the right label, closed mid-loop).
- Picking two issues in the same iteration that conflict on overlapping files, producing wasted parallel work and merge churn.

A naive design hands every open issue to an LLM and asks "what should I work on?". This pays an LLM round-trip every iteration, even when the answer is obvious.

## Decision

Two-phase pick:

1. **Eligibility (deterministic).** `pickEligible()` filters open issues by the `Sandcastle` label and excludes any already claimed by an open PR (via `Closes/Fixes/Resolves #N` parsed from PR bodies). Pure code, no LLM.
2. **Subset selection (LLM, conditional).** When two or more eligible candidates remain, a lightweight subset-selector agent picks a non-conflicting subset for parallel work. Single-candidate iterations skip the LLM round-trip entirely.

## Consequences

- Most iterations of a quiet backlog skip the LLM selector.
- The eligibility filter is testable as pure code with no model dependency.
- Reconciliation runs again inside the per-issue pipeline, so issues closed or claimed between picking and starting are caught.
- Cost: the eligibility rules are explicit (label + claim parsing). New rules require code changes, not prompt edits — accepted because explicit beats prompted for safety-critical filtering.

## Alternatives considered

- **One LLM call to pick everything:** pays full cost every iteration; harder to audit; harder to test.
- **No subset selector, just take the first eligible:** misses parallelism opportunities and risks file conflicts.
- **Static "no parallel work" rule:** wastes the AFK window on serial issues.
