# ADR 0018: AFK agents run in Docker sandboxes on issue branches; PR body links claim issues

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Sandcastle runs untrusted-by-default LLM agents that write code, run tests, and push branches. They need:

- Strong isolation from the host machine — the orchestrator's secrets, the developer's filesystem, other in-flight agents.
- A reproducible base image so a green run today is a green run tomorrow.
- A claim mechanism so two iterations don't duplicate work on the same issue.
- A handoff mechanism so the human reviewer can see exactly which issue a PR addresses.

Labels and assignees are racy across iterations and easy to forget. A claim model based on git branches alone is hidden from the issue tracker.

## Decision

- **Sandboxing:** each per-issue pipeline runs inside a fresh Docker container created from a pre-built image (`bun run sandcastle:build`). The host filesystem is not mounted; secrets are scoped to the container's environment.
- **Branching:** one branch per issue, named via the `<plan>` tag contract in `.sandcastle/plan.ts`. Concurrent runs operate on disjoint branches.
- **Claim:** the PR body must include `Closes #N` (or `Fixes`/`Resolves`). The eligibility filter (ADR 0017) parses this from open PRs to exclude already-claimed issues. The same convention closes the issue automatically when the PR merges.
- **Retry:** sandbox-creation failures are retried with backoff (`.sandcastle/retry.ts`); concurrency is bounded by `MAX_PARALLEL` (`.sandcastle/concurrency.ts`).

## Consequences

- A misbehaving agent can't touch the host or other agents' work.
- The issue tracker is the canonical claim ledger — readable by humans and the eligibility filter alike.
- Merged PRs auto-close issues, so the night-shift output appears as resolved tickets in the day-shift inbox.
- Cost: Docker is required to run Sandcastle locally. Image rebuilds when the Dockerfile changes.

## Alternatives considered

- **Worktrees instead of containers:** lighter, but no isolation from the host.
- **Labels/assignees as the claim:** racy, easily forgotten, invisible from the PR side.
- **GitHub branch protections as the only safety net:** doesn't protect the developer's machine while the agent is running.
