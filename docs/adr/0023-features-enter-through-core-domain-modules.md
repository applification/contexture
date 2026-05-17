# ADR 0023: Features enter through core domain Modules before adapters

- **Status:** Accepted
- **Date:** 2026-05-17

## Context

Contexture now has a clear product shape: it is the domain-model control plane for AI-native TypeScript apps, with `@contexture/core` as the shared kernel and desktop, CLI, MCP, and provider runtimes as surfaces over that kernel.

Recent architecture and security work tightened the trust envelope:

- Human, CLI, MCP, and provider edits converge on the closed-world Op vocabulary and Op applier.
- Generated target paths are described by shared core metadata rather than by app-local guesses.
- Desktop exposes a curated `window.contexture` preload surface instead of generic Electron APIs.
- Provider runtimes are adapters behind the schema-agent contract.
- Drift and Reconcile are explicit flows around the emitted manifest rather than silent overwrites.

As feature work resumes, the main architectural risk is adding behavior at the renderer, preload, or desktop IPC layer because that is where the user interaction happens first. That is fast locally, but it makes the feature unavailable to CLI/MCP callers, widens the desktop trust envelope, and leaves the domain behavior harder to test at the right seam.

## Decision

New features must identify a **feature entry seam** before adding UI, preload, IPC, or provider-specific behavior. The entry seam should be the deepest existing domain Module that owns the concept.

Default entry seams:

- Schema mutation features enter through the Op vocabulary, Op applier, and semantic gate.
- Generated target features enter through `@contexture/core` emitters, output config, `GeneratedTargetKind`, the generated target registry, and the emit pipeline.
- Document lifecycle features enter through the Document bundle Module: Contexture IR, Sidecar files, Generated targets, Seeded artifacts, and Emitted manifest handling.
- Agent/provider features enter through the Provider runtime Interface and Schema agent driver, preserving Schema-only mode.
- Drift and Reconcile features enter through generated bundle checks, the emitted manifest, Reconcile proposal generation, and generated target metadata.
- CLI and MCP features enter through `@contexture/core` or file-backed core helpers, then expose that capability through the CLI/MCP Adapter.

Desktop renderer code, preload methods, Electron IPC handlers, provider-specific code, and UI controls are Adapters. They may expose a feature only after the domain behavior exists behind the feature entry seam.

If a feature does not fit an existing entry seam, the implementer should deepen or introduce the domain Module first, or record a follow-up ADR explaining why the bypass is intentional. Temporary renderer-only or IPC-only prototypes are acceptable only when clearly marked as prototypes and not shipped as the durable implementation.

## Consequences

- New capabilities remain available across desktop, CLI, MCP, and provider surfaces instead of becoming desktop-only affordances.
- Security review stays simpler because new mutation behavior concentrates behind existing trust-envelope checks.
- Tests should target the feature entry seam first, then add narrower Adapter tests for UI, IPC, or provider translation.
- Feature work may need a little more up-front design, especially when a capability cuts across Document bundle, Generated target, and Reconcile concepts.
- PR review can apply a simple deletion test: if deleting the renderer or IPC change leaves no reusable domain capability behind, the feature probably entered at the wrong layer.

## Alternatives considered

- **Renderer-first features.** Fast for local interaction, but leaves no reusable capability for CLI, MCP, or agents and encourages duplicated validation.
- **IPC-first features.** Better than renderer-only for desktop, but still makes Electron main the source of truth and expands the trust envelope before the domain Module exists.
- **New Interface for every feature.** Rejected because one adapter is only a hypothetical seam. Prefer existing deep Modules unless repeated implementations prove a new seam is real.
- **Document this only in `CONTEXT.md`.** Useful vocabulary, but too weak for a load-bearing architectural rule. This ADR records the decision; `CONTEXT.md` names the concept.
