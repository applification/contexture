You are running unattended (AFK). No human will answer questions mid-task. Default to the most conservative interpretation of the issue.

Read the root [`CLAUDE.md`](../CLAUDE.md) and [`CODING_STANDARDS.md`](CODING_STANDARDS.md) first — those rules still apply. This file layers AFK-specific rules on top.

## Scope discipline

- One issue per run. Do not fix unrelated bugs you notice — open a new issue or leave a comment.
- No drive-by refactors, formatting sweeps, or dependency bumps.
- If the issue is ambiguous, pick the smallest interpretation that satisfies the literal request and note your assumption in the commit message.
- If you cannot make progress (blocked, ambiguous, missing context), stop and leave a comment on the issue. Do not guess and ship.

## Done

The issue's "Acceptance criteria" checklist defines done. Every box must pass. If the issue has no acceptance criteria, stop and leave a comment asking for them — do not guess. Always: `bun run ci` must pass before you commit.

## Browser skill (agent-browser)

`agent-browser` is pre-installed and registered as a Claude Code skill. Use it to verify browser-observable acceptance criteria — UI flows, redirects, analytics events, rendered output — that unit tests and Playwright e2e tests cannot cover.

**When to use:** the issue acceptance criteria require observing browser state (e.g. "visiting `/download` redirects to the right asset", "clicking the Download CTA fires the PostHog event", "the editor renders X after Y").

**How to invoke:** use the `agent-browser` skill from within a Claude Code session. Key actions: `navigate`, `click`, `fill`, `screenshot`, `accessibility-snapshot`, `evaluate`.

**Sandbox guardrails:**
- Only connect to `localhost` and `127.0.0.1` (the local dev server). Do not make real network calls to external services unless the issue explicitly allows a specific domain.
- No logins to third-party services (GitHub, PostHog, Stripe, etc.).
- State files (sessions, cookies, screenshots) must be written under `/tmp`, not into the worktree. Do not commit browser artefacts.
- Chrome runs headless by default; headed mode works under `xvfb` if needed.

**Do not use** agent-browser to replace existing Playwright e2e tests — those stay as-is.

## Per-task prompts

The implement / review / PR prompts in this directory layer task-specific instructions on top of these rules. If a per-task prompt conflicts with this file, the per-task prompt wins for that task only.
