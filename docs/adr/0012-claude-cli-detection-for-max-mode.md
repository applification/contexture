# ADR 0012: Detect a local `claude` CLI to enable Max-mode auth fallback

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Two kinds of users run the editor:

- API-key users: have an `ANTHROPIC_API_KEY` and want the SDK to use it directly.
- Claude Max subscribers: pay for a Max plan and authenticate through the local `claude` CLI. They expect the editor to "just work" without pasting an API key.

The Agent SDK shells out to the `claude` CLI when no `ANTHROPIC_API_KEY` is set. In packaged Electron apps the inherited `PATH` often doesn't see `~/.local/bin/claude` or other user-local install locations, so a relative `claude` lookup fails even when the binary is installed.

## Decision

On startup (and when the auth popover opens) the main process probes for a `claude` binary:

- `which claude` (or `where claude` on Windows) via `execFile`.
- The first hit is cached in `detectedClaudePath` and passed to the Agent SDK as `pathToClaudeCodeExecutable` so packaged apps work regardless of PATH inheritance.
- The result (`{installed, path}`) is exposed over IPC so the renderer can show a Max-mode-viable indicator before the user starts a turn.

The same detection predicts whether a turn will succeed without an API key, so the UI can fail fast with a clear message instead of waiting for an SDK error.

## Consequences

- Max users get zero-config sign-in if their CLI is installed.
- API-key users are unaffected — the env var path takes priority.
- The auth popover can show truthful state ("Max mode available" / "install the Claude CLI").
- Cost: one OS shell-out at startup. Negligible.

## Alternatives considered

- **Require API key always:** locks out Max subscribers.
- **Bundle the `claude` CLI:** licensing, update lag, two update channels.
- **Trust PATH and let the SDK error:** yields opaque failures inside packaged apps.
