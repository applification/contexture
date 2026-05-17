# Contexture Domain Glossary

Contexture is the domain-model control plane for AI-native TypeScript apps. These terms name the product concepts that should shape module names, interfaces, tests, ADRs, and agent instructions.

## Core Concepts

- **Contexture IR**: The canonical `.contexture.json` schema document. It is user-owned, versioned, diff-friendly, and the source of truth for generated artifacts.
- **Schema**: The parsed in-memory form of the Contexture IR. All human, CLI, MCP, and chat edits should produce a valid Schema.
- **Op**: One closed-world mutation in the Contexture op vocabulary, such as `add_type`, `add_field`, or `rename_type`. Ops are the only supported way for agents and UI controls to mutate a Schema.
- **Op applier**: The pure reducer that applies one Op to a Schema and returns either the next Schema or a user/model-safe error string.
- **Semantic gate**: The validation step that rejects newly introduced semantic issues after an Op, while allowing users or agents to repair pre-existing issues incrementally.
- **Feature entry seam**: The deepest existing Contexture Module where a new capability should attach before UI, IPC, provider, or renderer Adapter code is added. Schema mutations enter through Ops, generated outputs enter through core emitters and generated target metadata, provider behavior enters through Provider runtimes, and file/project behavior enters through the Document bundle.

## Document Bundle

- **Document bundle**: The files derived from one Contexture IR: the IR itself, `.contexture/` sidecars, generated artifacts, and the emitted manifest.
- **Bundle mode**: Contexture's document mode. Saves write the `.contexture.json` IR, `.contexture/` sidecars, generated artifacts, and emitted-file manifest.
- **Legacy bare IR**: A standalone `.contexture.json` without `.contexture/` sidecars. Desktop opens these directly as bundle documents and materializes sidecars on first save.
- **Sidecar**: Editor-owned state stored under `.contexture/`, such as graph layout, chat history, and the emitted manifest.
- **Generated target**: A file Contexture can regenerate from the IR, such as Zod, JSON Schema, Convex schema, schema index, AI tool schemas, MCP definitions, structured-output schemas, or form validators.
- **Integration guidance**: Copyable prompt, skill, or documentation that helps agents wire Contexture outputs into an existing repo without making Contexture own repo mutation.
- **Emitted manifest**: `.contexture/emitted.json`, a SHA-256 record of generated targets used to detect drift.

## Trust And Reconcile

- **Drift**: A generated target no longer matches the emitted manifest or the current IR output.
- **Drift watcher**: The desktop-side monitor that checks generated targets and notifies the renderer when drift appears or resolves.
- **Reconcile**: The user flow for reviewing drift and either regenerating from IR, leaving the file dirty, or applying proposed IR Ops.
- **Reconcile proposal**: Provider-generated candidate Ops that explain how to change the IR so Contexture emits something closer to the hand-edited generated target.
- **Trust envelope**: The explicit set of filesystem paths, IPC channels, protocols, and provider capabilities Contexture allows. New mutation surfaces should shrink or preserve this envelope.

## Agent And Provider Surfaces

- **Schema agent**: The provider-neutral chat surface that edits only the Schema through Contexture Ops.
- **Provider runtime**: A concrete adapter for a model/provider, such as Codex or Claude, behind the schema-agent contract.
- **Provider thread**: Provider-owned conversation state. Contexture stores only opaque thread references and marks them desynced when rollback or resume cannot be trusted.
- **CLI surface**: The `contexture` command-line interface for inspecting, validating, mutating, emitting, and checking drift in downstream projects.
- **MCP surface**: The `contexture-mcp` server, or packaged app `--mcp` entrypoint, exposing inspect, validate, apply-op, emit, and drift-check tools to agents.
- **Schema-only mode**: The provider runtime posture where the model receives only Contexture schema tools, not filesystem, shell, browser, or repository mutation tools.

## Standard Library

- **Stdlib**: Contexture's curated reusable type library, implemented in `@contexture/stdlib`.
- **Runtime package**: The public `@contexture/runtime` package consumed by generated user code. It re-exports the public subset of stdlib types.
- **Stdlib catalog**: Editor and validation metadata for resolving and prompting qualified stdlib refs such as `place.CountryCode`.
