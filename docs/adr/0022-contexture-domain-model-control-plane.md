# ADR 0022: Contexture is the domain-model control plane, not an app builder

- **Status:** Accepted
- **Date:** 2026-05-16

## Context

Contexture's codebase has converged on a stronger product shape than "visual Zod schema editor":

- `@contexture/core` owns a canonical IR, closed-world op vocabulary, validation, emitters, path conventions, and file-backed mutation helpers.
- The desktop app provides local-first visual and chat-assisted authoring over that IR.
- The CLI exposes the same IR/op/emit pipeline to downstream apps and coding agents.
- The document bundle records generated artefact hashes so drift can be detected instead of silently overwritten.
- The provider runtime work makes Codex/Claude adapters secondary to the same schema-only op contract.

At the same time, adjacent systems such as Sandcastle, Codex, Claude Code, project scaffolding, and future app-generation workflows create pressure for Contexture to become a broader task runner or app builder. That would blur the product's trust boundary and make the IR less obviously authoritative.

The product direction should preserve the narrow leverage point: Contexture owns the domain model and emits typed surfaces for apps and agents.

## Decision

Contexture is the **domain-model control plane for AI-native TypeScript apps**.

The product owns:

- Authoring and validating a canonical `.contexture.json` IR.
- Applying all human, CLI, and agent edits through the closed-world op vocabulary.
- Emitting typed surfaces from that IR, including Zod, JSON Schema, Convex schema, schema indexes, and future AI-pipeline artefacts such as tool schemas, extractor scaffolds, MCP definitions, and form validators.
- Detecting and reconciling drift in generated artefacts using the emitted hash manifest.
- Exposing the same model mutation surface to agents through CLI/MCP-style adapters.

The product does **not** own:

- Running coding agents as a general task orchestration surface.
- Managing issue backlogs, Kanban boards, missions, or PR pipelines.
- Shipping or deploying generated applications.
- Two-way sync with downstream framework files as the default model.
- Runtime schema editing for end users of downstream apps.

The desktop app remains the human visual authoring surface. The CLI and future MCP server are the agent/programmatic surfaces. All three must share `@contexture/core` as the source of truth.

## Consequences

- The immediate roadmap should prioritise trust and interoperability over app-builder breadth:
  1. Complete the project bundle and drift/reconcile experience.
  2. Ship an MCP or equivalent agent tool surface over `@contexture/core`.
  3. Add opt-in AI-pipeline emit targets.
  4. Dog-food Contexture on real Applification products before broad public positioning.
  5. Rebuild marketing around "Design your domain once. Ship it everywhere."
- Sandcastle and future mission orchestration stay outside Contexture. They may consume Contexture through CLI/MCP, but Contexture should not absorb their workflow responsibilities.
- Provider runtimes stay adapters. Codex-first and Claude-later work must preserve the schema-only op contract rather than turning schema chat into a general coding-agent surface.
- Generated files remain one-way emissions by default. If a generated file is edited by a human or agent, drift/reconcile is the safety mechanism; the emitter does not silently merge or overwrite.
- Future emit targets should be opt-in per project so the generated bundle stays focused on the app's actual needs.
- The older JSON-LD/OWL/Kosmos direction is not on the active path. It should not be reopened without new evidence from real users.

## Alternatives considered

- **Keep positioning as a visual Zod editor.** Too small: it undersells the existing Convex, JSON Schema, drift, CLI, and agent-safe op architecture.
- **Become a full app builder.** Too broad: it would compete with scaffolding, Sandcastle, and coding agents, while weakening Contexture's source-of-truth story.
- **Become a general agent orchestration product.** Rejected because Sandcastle/missions already cover that adjacent space; Contexture's leverage is a safe domain-model interface those agents can call.
- **Reopen the JSON-LD/frame pivot.** Rejected for now because the current implementation and product plan have converged on TypeScript/Zod/Convex/AI-pipeline schema design.
