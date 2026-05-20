# MCP cwd discovery plan

## Problem

The desktop app's Agent setup popover currently copies saved-document prompts
that include an absolute `.contexture.json` path:

```text
Use the Contexture MCP server to inspect /Users/davehudson/Apps/misprint/misprint.contexture.json, then validate, emit, and check drift before finishing.
```

That is reliable, but it is poor UX. A user is usually already working inside
the target repo, and a prompt that exposes the full local machine path feels
noisy and less portable.

The install command should stay as-is because the MCP executable path is
installed-app specific:

```bash
codex mcp add contexture -- /Applications/Contexture.app/Contents/Resources/bin/contexture-mcp
```

The saved-document prompt and smoke test should become project-relative and let
the MCP server resolve the active Contexture document from its working
directory.

## Current behavior

- The CLI can discover a single `*.contexture.json` from either
  `./packages/contexture/` or the current directory when `--ir` is omitted.
- The MCP tools require an `irPath` argument.
- The MCP server validates and reads the provided path directly.
- A bare `misprint.contexture.json` works only if the MCP process current
  working directory is already `/Users/davehudson/Apps/misprint`.
- The desktop app copies absolute-path prompts because they are the only
  universally reliable option today.

## Desired behavior

MCP should support the same project-oriented path behavior as the CLI:

1. If `irPath` is omitted, discover exactly one Contexture IR from the MCP
   process working directory.
2. If `irPath` is relative, resolve it against the MCP process working
   directory before reading, writing, emitting, or checking drift.
3. If no IR is found, fail loudly with an actionable message.
4. If multiple IRs are found, fail loudly and ask the agent to pass `irPath`
   explicitly.
5. Return resolved paths in structured tool output so downstream agents know the
   canonical file location after discovery.

## Proposed UX copy

Saved-document prompt:

```text
Use the Contexture MCP server from this project to inspect the Contexture document, then validate, emit, and check drift before finishing.
```

Smoke test for saved documents:

```text
Ask Codex: "List the contexture MCP tools, then inspect the Contexture document in this project."
```

The unsaved-document smoke test can remain:

```text
Ask Codex: "List the contexture MCP tools."
```

## Implementation plan

1. Move the CLI's IR discovery behavior into shared core code.
   - Add a helper such as `resolveContextureIrPath(input?: string, cwd = process.cwd())`.
   - Reuse the CLI search order: `./packages/contexture/`, then `./`.
   - Keep the "zero or multiple files" failure modes explicit.

2. Update the MCP tool input schema.
   - Make `irPath` optional for `inspect_contexture`, `validate_contexture`,
     `emit_contexture`, and `check_contexture_drift`.
   - Keep `irPath` accepted for explicit targeting.
   - Consider whether `apply_contexture_op` should allow omitted `irPath`.
     It probably should, for consistency, but only after discovery is
     deterministic and well-tested.

3. Resolve paths at the MCP boundary.
   - Before any tool reads or writes, convert omitted or relative input into a
     resolved `.contexture.json` path.
   - Pass only the resolved path into `readContextureFile`,
     `createFileBackedForward`, `writeGeneratedBundle`, and
     `checkGeneratedBundle`.

4. Update desktop Agent setup copy.
   - Keep the install command unchanged.
   - Replace absolute-path saved prompt copy with project-relative language.
   - Replace the saved-document smoke test with project-relative language.
   - Keep the save-first state, because unsaved documents still have no durable
     project to hand to an agent.

5. Update docs.
   - Document that MCP tools can discover the IR from the agent working
     directory.
   - Document when to pass `irPath` explicitly: multiple Contexture documents,
     unusual repo layouts, or an agent running outside the project directory.

## Test plan

- MCP server tests:
  - `inspect_contexture` with omitted `irPath` discovers
    `packages/contexture/app.contexture.json`.
  - `inspect_contexture` with omitted `irPath` discovers `app.contexture.json`
    in the current directory.
  - omitted `irPath` reports a structured validation failure when no IR exists.
  - omitted `irPath` reports a clear failure when multiple IRs exist.
  - relative `irPath` resolves against the MCP cwd and returns the resolved path.
  - `emit_contexture` and `check_contexture_drift` work with omitted `irPath`.
  - `apply_contexture_op` works with omitted `irPath` if that behavior is
    included.

- CLI tests:
  - Confirm existing CLI discovery behavior still passes after moving discovery
    into shared core code.

- Desktop renderer tests:
  - Agent setup still shows the packaged install command.
  - Saved-document prompt no longer includes the absolute document path.
  - Saved-document smoke test no longer includes the absolute document path.
  - Unsaved-document save-first state remains unchanged.

## Open questions

- Does Codex always launch project MCP servers with the active workspace as
  `process.cwd()`? If not, project-relative prompt copy is still better, but the
  prompt should include "from this project" so the agent has enough context to
  choose the right working directory or pass an explicit path.
- Should `apply_contexture_op` require explicit `irPath` for extra write safety,
  or should it follow discovery once read-only tools have proven the target?
  The ergonomic answer is to allow discovery; the conservative answer is to
  require explicit `irPath` only for writes.
- Should the desktop app offer a secondary "Copy explicit path prompt" action
  for unusual agent environments, or is the discoverable prompt enough?
