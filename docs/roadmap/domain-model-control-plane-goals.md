# Domain-Model Control Plane Goals

This roadmap turns [ADR 0022](../adr/0022-contexture-domain-model-control-plane.md) into
reviewable checkpoints. The current branch/PR should keep these checkpoints
layered and independently verifiable, but land the security floor,
`@contexture/core` simplification, Phase 1 IR fixes, drift/reconcile contract,
MCP surface, and multi-target emitters together so the generated bundle and
agent surfaces agree end to end.

Historical entries below were originally tracked as separate Codex-sized goals.
For the current consolidation PR, treat them as evidence and acceptance
criteria, not as instructions to split the work into separate initiatives.

## Goal 1 — Drift Status Trust Layer

**Status:** Done in PR 259.

Make generated-file drift detection reliable, visible, and tested. Missing
or unreadable generated files must be surfaced as attention-worthy drift,
not silently treated as clean.

## Goal 2 — Reconcile Minimum Viable Flow

**Status:** Done.

Let users either regenerate a drifted generated file from the current IR or
leave it dirty. This goal is intentionally narrower than semantic
fold-back: it must be safe, obvious, and limited to generated targets.

Completion evidence:

- Reconcile UI offers `Regenerate from IR`.
- `Leave dirty` closes the modal without clearing drift or writing files.
- Unknown or user-owned targets cannot be overwritten by this flow.
- Tests cover regenerate, leave-dirty, and generated-target safety.

## Goal 2.5 — Provider-Neutral Reconcile Proposals

**Status:** Done.

Move reconcile proposals off the Claude-only IPC path and onto the active
schema-agent provider. The reconcile modal should use the same selected
provider, model, effort, and options as schema chat, without adding a
second model picker in the modal.

Completion evidence:

- Reconcile proposal requests are routed through a provider-neutral
  schema-agent path, not `ipc/claude.ts`.
- Active Codex and Claude provider/model settings are respected.
- If the active provider is unavailable, proposal generation fails
  explicitly while `Regenerate from IR` and `Leave dirty` remain usable.
- Tests cover Codex routing, Claude routing, and unavailable-provider
  fallback behavior.

Notes:

- The preload `contexture.reconcile.query` bridge now invokes
  `schema-agent:reconcile`, preserving the renderer API while removing
  the Claude-only IPC handler.
- Provider runtimes expose a no-tools `generateText` path for isolated
  proposal generation. Normal schema chat still uses provider threads and
  Contexture op tools.

## Goal 3 — CLI/Agent Drift Contract

**Status:** Done.

Expose machine-readable drift status for CI and coding agents. The CLI
should report path, status, and a non-zero exit when generated files drift
or become unreadable.

Completion evidence:

- `contexture check-generated --json` reports every generated target as
  `{ path, status }`, where status is `clean`, `drifted`, or `unreadable`.
- Drifted or unreadable generated targets set a non-zero exit code.
- The older `stale` JSON field remains for compatibility while agents can
  consume the new `files` and `drift` arrays directly.

## Goal 4 — MCP Inspect/Validate Server

**Status:** Done.

Ship a minimal MCP surface over `@contexture/core` that can inspect and
validate a `.contexture.json` file without the desktop app running.

Completion evidence:

- `@contexture/cli` now ships a `contexture-mcp` stdio server.
- The server exposes read-only `inspect_contexture` and
  `validate_contexture` tools backed by `@contexture/core`.
- Tests exercise the MCP server with an in-memory MCP client, independent
  of the desktop app.

## Goal 4.5 — Packaged MCP Entry Point

**Status:** Done.

Make the MCP server accessible from an installed Contexture app, not just
from a source checkout. Agents need one stable, centrally installed command
to register after the user has created a `.contexture.json` file.

Target registration shape:

```bash
codex mcp add contexture -- /Applications/Contexture.app/Contents/MacOS/Contexture --mcp
```

Completion evidence:

- The packaged macOS app can launch the MCP stdio server via `--mcp`
  without opening the desktop window.
- The Electron main entrypoint routes `--mcp` to the shared
  `@contexture/core/mcp-server` factory before loading the desktop UI.
- The built `apps/desktop/out/main/index.js --mcp` runtime does not require
  `bun` or dev-only TypeScript execution.
- The registered installed-app command exposes the same
  `inspect_contexture` and `validate_contexture` tools as Goal 4.
- Tests cover the `--mcp` launch flag, CLI MCP compatibility, and a built
  main-process smoke test against `inspect_contexture`.
- Developer docs explain how agents register and smoke-test the installed
  MCP server.

## Goal 5 — MCP Mutation/Emit Loop

**Status:** Done.

Let agents mutate the IR through the closed-world op vocabulary, emit the
bundle, and check drift. The agent loop should be: inspect, apply op,
validate, emit, check drift.

Completion evidence:

- The shared MCP server exposes `apply_contexture_op`, `emit_contexture`, and
  `check_contexture_drift` alongside inspect/validate.
- `apply_contexture_op` writes through `createFileBackedForward`, so MCP
  mutations use the same closed-world op reducer and generated bundle path as
  the CLI.
- MCP tests exercise the full inspect/apply/emit/check loop against a temporary
  `.contexture.json` project.
- Agent docs describe the registered tool loop and example op payload.

## Goal 6 — Opt-In Output Config

**Status:** Done.

Add the IR shape for target-specific emit configuration. Existing outputs
should preserve current behavior; new AI-pipeline outputs should be opt-in.

Completion evidence:

- The IR accepts an optional top-level `outputs` config with current emit target
  switches and future AI-pipeline target slots.
- Omitted output config preserves the existing emitted bundle.
- Current generated targets can be disabled explicitly and are removed from the
  emitted manifest/drift surface.
- AI-pipeline target slots round-trip through load/save but do not emit files
  until Goal 7 adds the first opt-in emitter.

## Goal 7 — First AI-Pipeline Emitter

**Status:** Done.

Add one high-value opt-in generated target for AI engineers, such as
tool-call schema helpers or structured-output helper definitions. The new
target must participate in the emit manifest and drift detection.

Completion evidence:

- `outputs.aiPipeline.toolSchemas.enabled` emits
  `.contexture/ai-tool-schemas.json`.
- The generated document contains provider-neutral per-type tool definitions
  backed by JSON Schema parameters.
- The new file participates in the emitted manifest and existing drift checks.
- The target remains omitted unless explicitly enabled.

## Current Consolidation PR — Complete AI-Pipeline Emitters

**Status:** In progress on this branch.

The first AI-pipeline emitter proved the pattern. The current single-PR
roadmap branch extends that same manifest-backed pipeline to every
`outputs.aiPipeline` slot so the IR no longer advertises dormant output
targets.

Completion evidence:

- `outputs.aiPipeline.toolSchemas.enabled` emits
  `.contexture/ai-tool-schemas.json`.
- `outputs.aiPipeline.structuredOutputs.enabled` emits
  `.contexture/structured-output-schemas.json`.
- `outputs.aiPipeline.mcpDefinitions.enabled` emits
  `.contexture/mcp-definitions.json`.
- `outputs.aiPipeline.formValidators.enabled` emits `form-validators.ts`.
- All four targets are omitted unless explicitly enabled.
- All four targets participate in the emitted manifest and generated-file
  drift surface.

## Goal 8 — Dogfood One Real Product

**Status:** Done.

Use Contexture CLI/MCP to make one real schema change in an Applification
product. The change should start from the IR, regenerate artifacts, pass
drift checks, and feed sharp edges back into Contexture.

Completion evidence:

- Dogfooded against Recordshop's `packages/contexture/recordshop.contexture.json`.
- Used the Contexture CLI to add `Release.discogsReleaseId` and a
  `by_discogs_release_id` Convex index from the IR.
- Regenerated Recordshop's Zod, JSON Schema, index, Convex schema, and emitted
  manifest artifacts.
- Recordshop passes `validate` and the strengthened `check-generated` drift
  check.
- Fed back one Contexture sharp edge: CLI/MCP drift checks now include
  `.contexture/emitted.json`, so stale manifests cannot silently narrow the
  desktop watcher surface.
- Product typecheck was attempted, but Recordshop's top-level
  `packageManager: "bun"` currently blocks Turbo before TypeScript runs.

## Goal 9 — Marketing Rewrite

**Status:** Done.

Rewrite public positioning only after the trust layer, agent loop, and at
least one AI-pipeline output are credible. The site should sell: "Design
your domain once. Ship it everywhere."

Completion evidence:

- Rewrote the homepage hero around "Design your domain once. Ship it
  everywhere."
- Shifted public positioning from "visual Zod schema editor" to
  "domain-model control plane for AI-native TypeScript apps."
- Updated homepage sections to cover source-of-truth IR, closed-world agent
  ops, app-ready emit targets, MCP, AI tool schemas, manifest-backed drift
  checks, and Recordshop dogfooding.
- Updated site metadata, brand phrase guidance, README copy, and homepage smoke
  tests to match the new positioning.

## Goal 10 — Agent/Electron Trust Envelope

**Status:** Done.

Harden the writable trust envelope opened by the agent loop and desktop
project flows. Contexture now exposes real mutation surfaces through MCP, CLI,
schema chat, reconcile, and Electron IPC; those surfaces need explicit path,
protocol, and destructive-action guards before the next architecture
simplification pass.

Completion evidence:

- Reconcile generated-file reads/writes route through main-side IPC that only
  accepts known generated targets for the open `.contexture.json` bundle.
- Recursive project deletion rejects root, home, non-absolute, and non-directory
  targets even if the renderer misbehaves.
- Window-open external links are limited to expected external protocols.
- Tests cover allowed and rejected paths/protocols.
- MCP/CLI mutation and emit paths have explicit path-policy tests for accepted
  `.contexture.json` inputs and rejected output locations.

Progress:

- Reconcile now uses main-side generated-target IPC instead of legacy preload
  filesystem reads/writes.
- Project recursive delete now fails closed for root, home, relative, top-level,
  current-working-directory, and file targets.
- External window-open handling now denies non-http/mailto protocols.
- CLI and MCP now share core path policy: read-only and write-capable
  operations accept resolved `.contexture.json` inputs, and writes materialize
  missing bundle sidecars through the shared bundle writer.
- Tests cover non-IR path rejection, legacy bare-IR inspection, and CLI/MCP
  first-write bundle materialization.

## Goal 11 — Shared Generated-Bundle Writer

**Status:** Done.

Deepen the generated-bundle writer so desktop, CLI, and MCP share one core
implementation for building generated files, writing them atomically, checking
generated-file drift, and refusing implicit overwrites when the last emitted
manifest shows user or agent edits.

Completion evidence:

- `@contexture/core` owns `generated-bundle-writer`, which builds generated
  bundle entries, writes them with rollback, checks current generated output,
  and runs manifest-based drift preflight before implicit writes.
- CLI `emit` performs an explicit re-emit through the shared writer, while
  `check-generated` reports status through the shared checker.
- MCP `emit_contexture` and `check_contexture_drift` use the same writer/checker
  as the CLI.
- Desktop saves use the shared writer for generated artefacts and sidecars,
  including first saves of bare legacy `.contexture.json` files.
- Tests cover atomic rollback, generated drift preflight, explicit re-emit over
  drift, shared generated checks, file-backed op rejection over drift, and
  desktop save refusal to clobber edited generated files.

## Goal 12 — Pre-Feature Hardening Sweep

**Status:** Done.

Before adding the drift-preflight UX and reconcile apply loop, close the
remaining simplification and security gaps exposed by Goals 10 and 11. The aim
is to make the current trust envelope boring: generated bundle writes should go
through one core path, privileged Electron IPC should have narrow inputs, the
dependency audit should not have obvious high-severity desktop findings, and
the preload surface should expose one coherent Contexture interface.

This can be implemented as one parent goal with four independent slices. If any
slice grows, split it into its own PR while keeping this goal as the checklist.

### Goal 12A — App Scaffolder Removed

**Status:** Done.

The old app scaffolder has been removed. Contexture now initializes Document
bundles through `@contexture/core` instead of creating application workspaces.

Completion evidence:

- No desktop UI promises to create a web/mobile/desktop app.
- No desktop code shells out to framework CLIs for scaffolding.
- Bundle initialization writes Contexture-owned files through the shared
  generated-bundle writer.
- Tests cover bundle initialization, legacy-file save behavior, and manifest
  completeness.

Progress:

- The scaffold pipeline, IPC, preload surface, menu entry, dialog, and tests were
  removed.
- Bundle mode is marked by a sibling `.contexture/` directory. Bare
  `.contexture.json` files remain legacy import inputs; desktop Save / Save As
  initializes the bundle rather than preserving scratch semantics.
- CLI/MCP write-capable tools accept bundles in arbitrary directories.

### Goal 12B — Dependency Security Sweep

**Status:** Done.

Run and address the package audit before more feature work. The current audit
flags high-severity Electron advisories and moderate advisories in packages
used by renderer/markdown/provider surfaces.

Completion evidence:

- Electron is upgraded to a patched version supported by the current
  electron-builder/electron-vite toolchain, or any remaining Electron advisory
  is documented with a concrete non-applicability reason.
- Mermaid/Streamdown, PostCSS/Next/Vite, and Claude SDK transitive advisories
  are updated or documented with risk notes.
- `bun audit` output is clean, or all remaining findings are listed in an ADR
  or roadmap note with severity, affected surface, and why they are accepted.
- Desktop build, packaged MCP smoke, web build, and full local CI pass after
  dependency changes.

Progress:

- Electron was upgraded to the patched 39.8.x line and electron-builder to
  26.8.x.
- PostCSS is pinned through the root override to a patched 8.5.x release.
- Claude SDK transitive usage is forced to patched 0.95.1 through root
  overrides/resolutions while keeping the Claude Agent SDK on the newest
  installable release allowed by the repo's package age policy.
- Streamdown remains in place, with Mermaid pinned through the root override to
  patched 11.15.0. This was installed as an explicit security exception to the
  package age guard.
- `bun audit` reports no vulnerabilities.

### Goal 12C — Harden Shell and External IPC Inputs

**Status:** Done.

The renderer can still ask main to reveal/open arbitrary paths in the OS shell
or editor. Narrow this IPC so it remains useful for project files while being
less attractive if renderer content ever becomes compromised.

Completion evidence:

- `shell:reveal` and `shell:open-in-editor` validate that input is a non-empty
  absolute path and reject unsafe values before calling Electron shell APIs or
  spawning `code`.
- VS Code URI fallback encodes paths safely instead of string-concatenating
  raw renderer input into `vscode://file...`.
- Shell IPC tests cover accepted absolute paths, relative/empty rejection, and
  URI encoding.
- Existing project/open/reveal workflows still work from the renderer.

Progress:

- Shell IPC now rejects non-string, empty, relative, and null-byte paths before
  calling `shell.showItemInFolder`, spawning `code`, or opening the VS Code URL
  fallback.
- The VS Code fallback URL is built through `pathToFileURL` path encoding.
- Main-process shell IPC tests cover accepted paths, rejected paths, and
  encoded fallback URLs.

### Goal 12D — Narrow or Remove the Legacy Preload API

**Status:** Done.

`window.contexture` is now the preferred privileged interface, but `window.api`
still exposes legacy methods beside it. Reduce the renderer attack surface and
maintenance burden by deleting unused legacy methods or making the legacy API a
thin compatibility alias over the same typed `contexture` surface.

Completion evidence:

- Renderer references to `window.api` are removed where equivalent
  `window.contexture` methods exist.
- Legacy direct file helpers remain disabled or are deleted entirely.
- Preload tests/types demonstrate one canonical privileged Contexture surface,
  with any retained legacy aliases documented as temporary compatibility.
- No desktop tests rely on legacy-only preload methods.

Progress:

- Update controls moved from `window.api` to `window.contexture.update`.
- The unused legacy `ImprovementHUD` and its no-op preload channels were
  removed.
- `window.api` is no longer exposed from preload, and the preload type surface
  declares only `window.contexture`.

Completion evidence:

- Bundle initialization, desktop save, CLI, and MCP generated-output paths now share the core
  generated-bundle writer for generated artifacts and emitted manifests.
- Dependency advisories with available installable fixes were upgraded or
  pinned, including the Streamdown Mermaid transitive dependency; `bun audit`
  now reports no vulnerabilities.
- Shell IPC rejects unsafe path input before shell/editor calls and encodes the
  VS Code fallback URI.
- The renderer no longer uses or receives `window.api`; privileged renderer
  access is through `window.contexture`.
- Verified with targeted bundle/shell/update tests, desktop typecheck,
  desktop build, packaged MCP stdio smoke, web production build, and full local
  `bun run ci`.
