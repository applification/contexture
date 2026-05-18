# Remove App Scaffolder Plan

- **Status:** Implemented
- **Date:** 2026-05-17
- **Related ADRs:** [0022](adr/0022-contexture-domain-model-control-plane.md), [0023](adr/0023-features-enter-through-core-domain-modules.md)

## Decision Summary

Remove the desktop app scaffolder as a product feature.

Contexture should not create a Next.js, Expo, Electron, Turbo, Bun, Git, and
Convex application workspace. That makes the product look like an app builder
and anchors the value proposition to one Contexture-created repo shape.

Contexture should instead double down on the reusable domain-model control
plane:

- canonical `.contexture.json` IR
- closed-world schema Ops
- validation and semantic gate
- generated typed surfaces
- generated manifest, drift detection, and reconcile
- CLI and MCP access for agents
- integration guidance that helps coding agents wire generated outputs into
  existing codebases

The product promise becomes:

> Contexture defines, validates, emits, and reconciles your domain model. It
> does not create or own your application.

Sandcastle and other agent-orchestration experiments are out of scope for this
plan. They may keep consuming Contexture through CLI/MCP, but this work should
not move, redesign, or depend on Sandcastle.

## What To Delete

Delete the app-builder workflow, including:

- `File -> New Project...` as a monorepo/app creation flow
- Web / Mobile / Desktop app selection
- Turbo skeleton generation
- `create-next-app`
- `shadcn init`
- `create-expo-app`
- `create-electron-app`
- Convex local project provisioning
- `bun install`
- `git init`, `git add`, and initial commit
- scaffold stage progress UI, logs, retry semantics, and failure panels
- scaffold preflight checks for Bun, Git, Node, npm registry, free space, and
  target directory ownership
- recursive "delete and start over" support that exists only for partial app
  scaffolds

Likely deletion surface:

- `apps/desktop/src/main/scaffold/`
- `apps/desktop/src/main/ipc/scaffold.ts`
- scaffold-specific preload API and types
- `apps/desktop/src/shared/scaffold-stages.ts`
- `apps/desktop/src/renderer/src/components/dialogs/NewProjectDialog.tsx`
- `apps/desktop/src/renderer/src/store/new-project.ts`
- `apps/desktop/src/renderer/src/hooks/useNewProject.ts`
- scaffold-specific renderer models
- scaffold-specific tests and e2e coverage
- `project:delete-directory` IPC if no other flow needs it
- menu entry and tests for `New Project...`

## What To Keep Or Rebuild

Keep only the Contexture document-bundle capabilities, and move any missing
behavior to `@contexture/core`.

The durable domain module should initialize a Contexture bundle from parsed
domain values, not import files or create an application repo. Adapters may
offer "new empty bundle" or "promote scratch file" flows, but they should read
and parse scratch files before crossing the core seam.

Layout and chat history are Document bundle Sidecars, not desktop-only state.
As part of this work, move their versioned types, defaults, load functions, and
save functions from `apps/desktop/src/shared` into `@contexture/core`, then let
desktop import them from core. If any provider-specific chat metadata feels too
desktop-specific, keep it opaque or split it out, but do not make core import
desktop shared modules.

Suggested core interface:

```ts
interface InitialDocumentSidecars {
  layout?: Layout;
  chat?: ChatHistory;
}

interface InitializeDocumentBundleInput {
  irPath: string;
  schema: Schema;
  sidecars?: InitialDocumentSidecars;
  fs: GeneratedBundleFs;
  emitDeps?: EmitPipelineDeps;
}

async function initializeDocumentBundle(
  input: InitializeDocumentBundleInput,
): Promise<GeneratedBundleWriteResult>;
```

Suggested file-backed adapter helper:

```ts
interface PromoteScratchToBundleInput {
  scratchIrPath: string;
  bundleIrPath: string;
  initialChatMessage?: string;
  fs: GeneratedBundleFs;
}

async function promoteScratchToBundle(
  input: PromoteScratchToBundleInput,
): Promise<GeneratedBundleWriteResult>;
```

The adapter helper may live in core if CLI/MCP need it, but the deeper
initializer should stay path-shape-agnostic and schema-first.

The operation should write only Contexture-owned files:

```txt
<name>.contexture.json
<name>.schema.ts
<name>.schema.json
index.ts
form-validators.ts                 # when enabled
convex/schema.ts                   # when enabled
.contexture/
  layout.json
  chat.json
  emitted.json
  ai-tool-schemas.json             # when enabled
  structured-output-schemas.json   # when enabled
  mcp-definitions.json             # when enabled
```

It must not shell out, install dependencies, create application folders, mutate
Git state, or infer framework-specific integration.

It also must not automatically seed user-owned repo files such as `AGENTS.md`,
`CLAUDE.md`, or per-table CRUD files. Those can reappear as explicit generated
prompts, skill instructions, or copyable integration artifacts, but opening or
initializing a Document bundle should not mutate files outside the bundle's
Contexture-owned generated target set.

## Bundle Path Policy

Removing the app scaffolder should also remove the durable assumption that a
writable Contexture project must live at:

```txt
<repo>/packages/contexture/<name>.contexture.json
```

That path remains a valid convention, but not a product requirement.

Bundle mode should replace the current "Project mode" language and mean:

```txt
<dir>/<name>.contexture.json
<dir>/.contexture/
```

where the sibling `.contexture/` directory marks the IR as a Contexture bundle.
Scratch mode remains a bare `.contexture.json` with no sibling `.contexture/`.
Because there is no backward-compatibility requirement, rename the
`DocumentMode` variant from `project` to `bundle` instead of carrying the old app
builder wording forward.

Implementation implication:

- Keep pure path normalization in `assertContextureIrPath`, but replace
  `assertWritableContextureProjectIrPath` with an async/file-backed writable
  bundle guard. Bundle mode is filesystem state: the sibling `.contexture/`
  directory exists.
- File-backed CLI/MCP `apply_contexture_op` should still refuse to mutate
  scratch files unless the caller first initializes/promotes the bundle.
- The explicit initialize/promote operation is the sanctioned way to create the
  sibling `.contexture/` directory and generated manifest.
- Path helpers such as `bundlePathsFor` can continue deriving generated targets
  relative to the IR path; they should not assume the app's root directory.
- Delete or isolate `projectRootFor` and `buildSeededArtifacts` behavior that
  infers a repo root from `packages/contexture`; it belongs to integration
  guidance, not Document bundle initialization.

Desktop, CLI, and MCP should be adapters over this core operation:

- Desktop: create a new `.contexture.json` or promote a scratch file to a
  bundle.
- CLI: expose equivalent commands once the core seam exists.
- MCP: let an agent initialize or promote a bundle through the same file-backed
  semantics, if that tool is needed.

## Replacement Product Flows

### New Contexture File

Create a bare scratch-mode `.contexture.json`.

This remains the smallest possible artifact and should keep working for users
who only want the IR.

### Promote To Contexture Bundle

Take an existing scratch `.contexture.json` and add sidecars, generated outputs,
and an emitted manifest around it.

Scratch mode:

```txt
app.contexture.json
```

Bundle mode:

```txt
app.contexture.json
app.schema.ts
app.schema.json
index.ts
.contexture/
  layout.json
  chat.json
  emitted.json
```

This is the replacement for the useful part of the old scaffolder.

The promotion flow should be explicit. Opening a scratch file should not
silently create sidecars or generated targets; the user or agent chooses to
promote it.

### Generate Integration Prompt

Generate a prompt that a coding agent can run inside an existing repo.

The prompt should be tailored to the selected generated targets and should tell
the agent to:

- treat the Contexture IR as the source of truth
- run `contexture validate`
- run `contexture emit`
- run `contexture check-generated`
- wire generated Zod schemas into validation code where appropriate
- wire JSON Schema into API, docs, or tooling where appropriate
- wire Convex schema only if the repo actually uses Convex
- wire MCP definitions, structured outputs, or form validators only when enabled
- avoid editing generated files directly
- use Contexture drift/reconcile instead of overwriting generated drift

### Skills.sh Integration Skill

Publish a Contexture integration skill through the open skills ecosystem at
<https://www.skills.sh/>.

The skill should be the agent-side repo integration workflow. Contexture should
not reinvent a repo mutation runner inside the desktop app.

MCP setup and the `skills.sh` skill solve different problems and should both
stay in the plan. MCP is the tool surface for safe Contexture operations; the
skill is the agent playbook for applying those operations inside an arbitrary
repo.

Suggested skill name:

```txt
contexture-integration
```

Suggested skill responsibility:

```md
Use Contexture as the source of truth for a TypeScript app's domain model.
Inspect the repo, find appropriate integration points, configure Contexture
CLI/MCP, wire generated outputs, and preserve the IR/generated-file contract.
```

The skill should instruct agents to:

- locate or ask for the `.contexture.json` file
- inspect the existing repo before choosing integration points
- configure package scripts only when appropriate
- install or use the Contexture CLI
- configure the Contexture MCP server where supported
- wire generated outputs into existing code without assuming a framework
- preserve generated-file ownership rules
- report any framework-specific uncertainty instead of guessing

This lets Codex, Claude Code, Cursor, and other skill-aware tools do
repo-specific integration in their normal environment, while Contexture stays
focused on the IR and generated surfaces.

Keep this in the plan as a first-class integration path. It is not a blocker for
removing the app scaffolder, but it is the right home for repo mutation
instructions that would otherwise creep back into the desktop app.

### First-Class MCP Setup

MCP setup should become a primary integration affordance.

Desktop and docs should provide copyable setup for the installed app entrypoint:

```json
{
  "mcpServers": {
    "contexture": {
      "command": "/Applications/Contexture.app/Contents/MacOS/Contexture",
      "args": ["--mcp", "--ir", "/absolute/path/to/app.contexture.json"]
    }
  }
}
```

The source-checkout command can remain documented for contributors, but the
installed app entrypoint should be the user-facing recommendation.

## Documentation Updates

Update product and agent docs so they no longer imply Contexture owns a
scaffolded Convex + Next.js app.

Known stale language:

- `packages/core/src/emit-claude-md.ts` currently says "A Convex + Next.js
  monorepo scaffolded by Contexture."
- emitted agent guidance assumes `apps/web` and `packages/contexture`
  integration.
- `CONTEXT.md`, code comments, and tests should rename durable "Project mode"
  wording to "Bundle mode" if this plan makes that terminology change.
- README and marketing language should describe Contexture as reusable across
  existing codebases.
- `docs/agent-mcp.md` should become the primary setup path for coding agents.

## Implementation Slices

### Slice 1: Delete App Scaffolder Surface

- Remove desktop scaffold modules, IPC registration, preload surface, renderer
  dialog/store/hooks/models, shared stage vocabulary, and tests.
- Remove the `New Project...` menu entry.
- Remove partial-scaffold delete flow if no other feature uses it.
- Ensure app still builds and file open/save/new scratch flows still work.

### Slice 2: Core Bundle Initializer

- Add a core document-bundle initializer that takes a parsed `Schema`.
- Move Document bundle sidecar IO for layout and chat history into
  `@contexture/core`, or keep the initializer sidecar-serialized if that split is
  intentionally deferred.
- Add a thin promote helper only if CLI/MCP need file-backed scratch promotion.
- Reuse `writeGeneratedBundle`, `buildSidecarEntries`, and existing path
  helpers.
- Add tests in `packages/core/tests`.
- Keep the interface framework-agnostic and shell-free.

### Slice 3: Bundle Path Policy

- Rename durable "Project mode" terminology to "Bundle mode".
- Replace `packages/contexture` as the writable-agent path rule with an
  async/file-backed bundle-mode guard.
- Keep scratch files read-only for file-backed agent mutation until explicitly
  promoted.
- Update path/security tests so the rule is "sibling `.contexture/` exists",
  not "directory name is `packages/contexture`".
- Remove automatic seeded artifact writes from Document open/initialize paths;
  route repo guidance through MCP setup, prompt generation, and the `skills.sh`
  skill.

### Slice 4: Desktop Bundle Flow

- Add a small desktop adapter for creating/promoting a Contexture bundle.
- Use the core initializer.
- Keep UI copy explicit: this creates Contexture files, not an application.
- Do not add stage logs, shell output, retry semantics, or package-manager
  checks.

### Slice 5: MCP Setup UX

- Promote `docs/agent-mcp.md` into a user-facing setup flow.
- Add copyable installed-app config snippets.
- Ensure MCP server tools are framed as the safe agent interface over IR,
  validation, emit, and drift.

### Slice 6: Integration Prompt Emitter

- Add a pure emitter for an integration prompt.
- Include selected outputs and the absolute IR path.
- Expose it in desktop as copyable text.
- Consider CLI exposure after the core emitter exists.

### Slice 7: Skills.sh Skill

- Create a public skill repository or folder for `contexture-integration`.
- Publish/distribute through `skills.sh` using its normal install flow.
- Link the skill from desktop/docs.
- Keep repo mutation instructions in the skill, not in Contexture desktop
  scaffolding code.

## Orchestrator Handoff

The main orchestrator agent should treat this as the replacement direction for
the old app scaffolder.

Do not deepen or repair the current scaffold pipeline. Delete it.

The surviving product capability is:

1. create or promote a Contexture IR/document bundle
2. generate typed artifacts and manifests from that IR
3. expose CLI/MCP for agents
4. generate prompts/skills/config that help agents integrate Contexture into
   arbitrary existing codebases

Success criteria:

- no UI promises to create a web/mobile/desktop app
- no desktop code shells out to framework CLIs for scaffolding
- no Contexture-owned Git/package-manager app setup path
- generated outputs remain available across desktop, CLI, and MCP
- agent integration story routes through MCP, CLI, prompts, and the
  `skills.sh` skill
