You are running unattended (AFK). No human will answer questions mid-task. Default to the most conservative interpretation of the issue.

Read the root [`CLAUDE.md`](../CLAUDE.md) and [`CODING_STANDARDS.md`](CODING_STANDARDS.md) first — those rules still apply. This file layers AFK-specific rules on top.

## Scope discipline

- One issue per run. Do not fix unrelated bugs you notice — open a new issue or leave a comment.
- No drive-by refactors, formatting sweeps, or dependency bumps.
- If the issue is ambiguous, pick the smallest interpretation that satisfies the literal request and note your assumption in the commit message.
- If you cannot make progress (blocked, ambiguous, missing context), stop and leave a comment on the issue. Do not guess and ship.

## Done

The issue's "Acceptance criteria" checklist defines done. Every box must pass. If the issue has no acceptance criteria, stop and leave a comment asking for them — do not guess. Always: `bun run ci` must pass before you commit.

## Per-task prompts

The implement / review / PR prompts in this directory layer task-specific instructions on top of these rules. If a per-task prompt conflicts with this file, the per-task prompt wins for that task only.
