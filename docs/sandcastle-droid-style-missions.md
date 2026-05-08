# Sandcastle → Droid-style Missions

## Context

`.sandcastle/main.ts` today drains a GitHub Project "Ready" column one issue at a time, runs an implementer + (conditional) reviewer in Docker sandboxes, and opens PRs host-side. It's flat: no plan, no milestones, no validation gate, no replanning, no notion of dependencies between features.

Replace `main.ts` with a Droid-style Missions orchestrator: planner → milestones → features (with deps + path ownership) → parallel workers → per-branch reviewer/fixer → milestone integration validator → replanner when blocked. Convex (running `--local` in v1) is canonical state. The orchestrator is a deterministic outer loop with LLMs only at the leaves; Sandcastle remains the worker harness so every agent inside a sandbox can use Claude Max / Codex Max via bind-mounted CLI auth.

### In scope (v1)

- New `apps/missions/` package in this turborepo: Convex schema, mutations, queries; Convex runs `--local`.
- Replace `.sandcastle/main.ts` with a `mission` CLI: `plan`, `run`, `status`, `pause`, `resume`, `replan`.
- Planner as a portable Claude Code skill, invokable interactively or headlessly.
- Workers, reviewer + fixer loop, milestone validator, replanner.
- `mission status` static coloured table from Convex (no live TUI, no `--watch`).
- PR creation embedding Convex feature ID in the body.

### Explicitly not in v1

- Web dashboard (schema is reactive-ready, but no UI shipped).
- GitHub Projects mirror (Convex is the source of truth).
- GitHub issues per feature (PRs only; PR URL stored in Convex).
- Convex cloud deployment (local dev only).

## Layout

```
apps/missions/
  convex/
    schema.ts                     # tables: missions, milestones, features, runs, events
    missions.ts                   # query + mutation functions
    milestones.ts
    features.ts
    runs.ts
    events.ts
  package.json                    # convex dep, dev script (`convex dev`)
  README.md                       # how to run convex --local

.sandcastle/
  main.ts                         # REPLACED: CLI dispatcher (plan/run/status/pause/resume/replan)
  missions/
    orchestrator.ts               # state machine + Convex client + main loop
    scheduler.ts                  # dependency resolution + path-conflict serialization
    run-agent.ts                  # unified agent invocation (worker | reviewer | fixer | validator | replanner)
    planner.ts                    # shells out to claude with mission-plan skill, validates, inserts
    schema.ts                     # Zod validators for planner-emitted JSON
    status-view.ts                # render milestones × features as a coloured table
    prompts/
      worker.md
      reviewer.md
      validator.md
      replanner.md
    skills/
      frontend.md
      backend.md
      db.md
      tests.md
  harness.ts                      # KEEP (provider dispatch, logging)
  github.ts                       # KEEP, slim down (PR creation only)
  enforcement/                    # KEEP (biome hook)
  analyzer/                       # KEEP (post-run analysis)
  analyze.ts                      # KEEP
  Dockerfile                      # MODIFY: bind-mount ~/.claude and ~/.codex
  .env.example                    # add CONVEX_URL, CONVEX_DEPLOY_KEY (local dev: derived from `convex dev` output)
  CLAUDE.md                       # KEEP
  CODING_STANDARDS.md             # KEEP

.claude/skills/mission-plan/
  SKILL.md
  schema-reference.md             # exact MissionPlan JSON shape

package.json                      # add "mission" script; remove "sandcastle"; add convex + workspace dep on apps/missions
turbo.json                        # add apps/missions to pipeline (typecheck, dev)
```

## Module breakdown (6 modules, behaviour in 2)

| Module | Role | Notes |
|---|---|---|
| `orchestrator.ts` | **Real logic** | Main state-machine loop, Convex client + typed mutations inlined here, pause/resume checks, branch merging for validator runs |
| `scheduler.ts` | **Real logic** | Pure functions: dependency resolution + path-conflict serialization. Heavy unit tests |
| `run-agent.ts` | Glue | Single typed function `runAgent({ role, mission, milestone?, feature?, branch, ... })` that handles worker, reviewer, fixer, validator, replanner. Role-discriminated config picks prompt + agent provider + completion signal. Writes to Convex on start/finish |
| `planner.ts` | Glue | Shells out to `claude --skill mission-plan --prompt "<obj>"`, parses JSON, validates against `schema.ts`, calls orchestrator's `createMission` helper |
| `schema.ts` | Validation | Zod for planner JSON input only. Convex's own validators handle DB-side shape |
| `status-view.ts` | Glue | Coloured table from Convex query result. Standalone consumer, separate tests |

`cli.ts`, `convex-client.ts`, and `pull-requests.ts` from earlier drafts are gone — folded into `orchestrator.ts` (Convex + PR creation) and `main.ts` (CLI dispatch).

## Convex schema (`apps/missions/convex/schema.ts`)

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  missions: defineTable({
    slug: v.string(),
    title: v.string(),
    objective: v.string(),
    status: v.union(
      v.literal("planning"), v.literal("running"),
      v.literal("paused"), v.literal("done"), v.literal("failed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  milestones: defineTable({
    missionId: v.id("missions"),
    order: v.number(),
    title: v.string(),
    successCriteria: v.array(v.string()),
    validationPrompt: v.string(),
    status: v.union(
      v.literal("todo"), v.literal("running"),
      v.literal("validating"), v.literal("done"), v.literal("blocked"),
    ),
  }).index("by_mission", ["missionId", "order"]),

  features: defineTable({
    missionId: v.id("missions"),
    milestoneId: v.id("milestones"),
    slug: v.string(),
    title: v.string(),
    prompt: v.string(),
    dependencies: v.array(v.id("features")),
    pathsOwned: v.array(v.string()),
    preferredAgent: v.union(v.literal("claude"), v.literal("codex")),
    skillRefs: v.array(v.string()),
    status: v.union(
      v.literal("todo"), v.literal("planned"), v.literal("running"),
      v.literal("review"), v.literal("blocked"), v.literal("done"),
    ),
    branch: v.optional(v.string()),
    pullRequestUrl: v.optional(v.string()),
    reviewVerdict: v.optional(
      v.union(v.literal("approved"), v.literal("changes_requested")),
    ),
    fixerAttempts: v.number(),
  })
    .index("by_milestone", ["milestoneId"])
    .index("by_status", ["status"]),

  runs: defineTable({
    missionId: v.id("missions"),
    featureId: v.optional(v.id("features")),
    milestoneId: v.optional(v.id("milestones")),
    role: v.union(
      v.literal("worker"), v.literal("reviewer"), v.literal("fixer"),
      v.literal("validator"), v.literal("replanner"),
    ),
    agent: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    outcome: v.optional(
      v.union(v.literal("success"), v.literal("failure"), v.literal("aborted")),
    ),
    branch: v.optional(v.string()),
    logUri: v.optional(v.string()),
  }).index("by_feature", ["featureId"]),

  events: defineTable({
    missionId: v.id("missions"),
    at: v.number(),
    actor: v.union(
      v.literal("orchestrator"), v.literal("dashboard"), v.literal("user"),
    ),
    kind: v.string(),
    detail: v.any(),
  }).index("by_mission", ["missionId", "at"]),
});
```

Mutations (in `apps/missions/convex/`): `createMission(plan)`, `setFeatureStatus(id, status)`, `setMilestoneStatus(id, status)`, `recordRunStart`, `recordRunEnd`, `appendEvent`, `replanMilestone(milestoneId, newFeatures)`, `pauseMission(slug)`, `resumeMission(slug)`. Queries: `getMissionWithChildren(slug)`, `listRunnableFeatures(milestoneId)`, `listMissions()`.

The orchestrator imports types directly from `apps/missions/convex/_generated/api` via the workspace — no published package.

## Planner

Portable Claude Code skill plus a thin shim. Two invocation paths produce identical Convex state.

- **Interactive**: `/mission-plan "<objective>"` inside Claude Code → grills user → emits JSON → user runs `bun run mission plan --apply <path>` to ingest.
- **Headless**: `bun run mission plan "<objective>"` shells out to `claude --skill mission-plan --prompt "<obj>"`, captures JSON, validates with Zod, calls Convex `createMission`. On schema failure: re-prompt with the validation error appended.

## CLI

```
bun run mission plan "<objective>"        # interactive grilling → Convex
bun run mission plan --apply <path>       # ingest a previously-saved planner JSON
bun run mission run [--mission <slug>]    # execute selectable features
bun run mission status [--mission <slug>] # static coloured table from Convex
bun run mission pause <slug>
bun run mission resume <slug>
bun run mission replan <milestone-id>     # invoke replanner agent
```

`status` groups by milestone with columns: feature slug, title, status, branch, fixer attempts, last-run age. Re-run to refresh.

## Execution loop (`orchestrator.ts`)

1. Read mission state from Convex. Pause check at top of loop.
2. Pick first non-done milestone.
3. `scheduler.selectRunnable(milestone)`:
   - feature.status === "todo"
   - all dependency features have status === "done"
   - **path-conflict serialization**: candidate's `pathsOwned` doesn't `picomatch`-overlap any currently-running feature's paths
   - cap concurrency at `MAX_PARALLEL` (currently 2)
4. For each runnable feature in parallel: `runAgent({ role: "worker", ... })`:
   - mutation: `setFeatureStatus(id, "running")`, `recordRunStart`
   - `sandcastle.run({ branchStrategy: { type: "branch", branch }, agent, promptFile: "missions/prompts/worker.md", promptArgs, maxIterations: 5, completionSignal: "<promise>COMPLETE</promise>" })`
   - On commits → `setFeatureStatus("review")`. No commits → `setFeatureStatus("blocked")`.
   - mutation: `recordRunEnd`
5. `runAgent({ role: "reviewer", ... })` on the same branch with `codex("gpt-5.4")`:
   - Prompt requires `<review_result>approved|changes_requested</review_result>`.
   - `changes_requested` and `fixerAttempts < 2` → `runAgent({ role: "fixer", ... })`, increment, re-review.
   - `approved` → `setFeatureStatus("done")`, push branch, `gh pr create` with body `Mission: {slug}, Feature: {convexId}`. Store `pullRequestUrl` in Convex.
6. When all features in milestone are done: `runAgent({ role: "validator", ... })`:
   - Branch strategy `{ type: "branch", branch: "mission/{slug}/integration", baseBranch: "main" }`.
   - Orchestrator merges feature branches into integration branch host-side before the run.
   - Validator runs `bun run ci` and evaluates `successCriteria`. Emits `<validation_result>approved|failed</validation_result>`.
   - Approved → `setMilestoneStatus("done")`, advance, open integration PR.
   - Failed → `runAgent({ role: "replanner", ... })`; new features inserted via `replanMilestone` mutation; loop continues.
7. After loop: `bun .sandcastle/analyze.ts`; update `runs.logUri` for each run.

### Pause/resume

`pauseMission(slug)` sets `mission.status = "paused"`. The orchestrator checks at the top of every loop iteration and at every feature start. If paused: finish in-flight features (don't kill mid-flight), don't pick up new work, exit cleanly. `resumeMission` flips it back; user re-runs `mission run`.

### Trust boundary

The orchestrator on the host is the only thing with the Convex deploy key. Workers inside Sandcastle containers don't have Convex credentials. They emit completion signals + commits; the orchestrator translates those into Convex mutations.

## Cross-cutting: subscription auth

Every non-planner agent runs inside Sandcastle's Docker container and consumes Claude Max / Codex Max via bind-mounted `~/.claude` and `~/.codex`. Verify and update `.sandcastle/Dockerfile` and the sandcastle invocation site to mount `~/.codex` if absent. Without this, Codex calls fail or fall back to API tokens.

## Key reuses

- **`harness.ts:agent()`** — provider dispatch (claudeCode + codex) drives `run-agent.ts`.
- **`harness.ts:streamLogger()`** — wraps each agent run; emits to `logs/{missionSlug}/{featureSlug}-{role}.log`. Path becomes `runs.logUri`.
- **`enforcement/`** — biome hook on every worker + fixer run.
- **`analyzer/`** — post-orchestrator. No schema changes.
- **`github.ts`** — keep PR creation; remove all Project board / item fetching code.
- **Sandcastle `branchStrategy: { type: "branch", branch, baseBranch }`** — feature branches and integration branches.
- **`completionSignal`** — `<promise>COMPLETE</promise>`, `<review_result>…</review_result>`, `<validation_result>…</validation_result>`.

## Files to create

- `apps/missions/convex/{schema,missions,milestones,features,runs,events}.ts`
- `apps/missions/{package.json,README.md}`
- `.sandcastle/missions/{orchestrator,scheduler,run-agent,planner,schema,status-view}.ts`
- `.sandcastle/missions/prompts/{worker,reviewer,validator,replanner}.md`
- `.sandcastle/missions/skills/{frontend,backend,db,tests}.md`
- `.claude/skills/mission-plan/{SKILL.md,schema-reference.md}`

## Files to modify

- `.sandcastle/main.ts` — replace with CLI dispatcher
- `.sandcastle/github.ts` — strip Project board / `eligibility` / Ready-column code; keep PR helpers
- `.sandcastle/Dockerfile` — bind-mount `~/.codex`
- `.sandcastle/.env.example` — add `CONVEX_URL`, `CONVEX_DEPLOY_KEY`
- `package.json` — add `"mission"` script; remove `"sandcastle"`; add `convex` and workspace dep on `apps/missions`
- `turbo.json` — include `apps/missions` in typecheck + dev pipelines
- `README.md` / `CLAUDE.md` — document Missions workflow

## Files to delete

- `.sandcastle/implement-prompt.md`
- `.sandcastle/implement-docs-prompt.md`
- `.sandcastle/review-prompt.md`
- `.sandcastle/eligibility.ts` + `eligibility.test.ts`
- `.sandcastle/issue.ts` + `issue.test.ts`

(Keep `github.test.ts`; rewrite around remaining PR helpers.)

## Build sequence

1. **`apps/missions/`**: bootstrap Convex schema, mutations, queries. Run `convex dev` locally; verify `_generated/api.d.ts` is produced. Light `convex-test` coverage on mutations.
2. **`schema.ts` + `scheduler.ts`** in `.sandcastle/missions/`. Pure functions, well-tested (Vitest): planner JSON round-trip, dep resolution, path-conflict serialization.
3. **Planner skill + headless shim**. Test interactively in Claude Code, then headlessly via the shim, on the same objective. Assert both produce schema-valid output and identical Convex insertions (modulo timestamps).
4. **`main.ts` CLI dispatcher** with `status` and `plan` subcommands first.
5. **`run-agent.ts`** unified agent invoker. Confirm `~/.codex` is mounted into the Sandcastle container.
6. **`orchestrator.ts` happy path** — single milestone, single feature, end-to-end against local Convex.
7. **Reviewer + fixer loop** wired in.
8. **Validator** + integration branch merge logic.
9. **Replanner** hooked on validator failure.
10. **Legacy cleanup** — delete prompts/eligibility/issue modules; update README + CLAUDE.md.

## Verification

- **Unit (`apps/missions`)**: `convex-test` for mutations + queries — correct status transitions, no orphan features, replan inserts.
- **Unit (`.sandcastle/missions`)**: `bun test {schema,scheduler,status-view}.test.ts` — schema round-trip, scheduler resolution, table rendering with stub data.
- **Planner parity**: same objective interactive vs. headless → schema-valid + identical Convex shape.
- **Smoke**: real run with a 1-milestone, 1-feature mission ("add a comment to README") against local Convex — mission created, PR opened with Convex feature ID in body, `mission status` reflects state, validator passes, analyzer emits report and writes `logUri`.
- **Resume**: kill orchestrator mid-run, restart `bun run mission run`, confirm in-flight features re-detected, no duplicate work.
- **Pause/resume**: `mission pause <slug>` mid-run, confirm orchestrator finishes in-flight feature and exits; `mission resume` + `mission run` picks up cleanly.
- **Replan**: seed a failing milestone — confirm validator fails, replanner appends fix-features, status shows them in Todo, orchestrator picks them up.
- **Subscription auth**: worker run consumes Claude Max quota; Codex worker consumes Codex quota — not API tokens.
- `bun run ci` clean.

## Risks & notes

- **Local Convex lifecycle**: `convex dev` must be running for the orchestrator to work. Document the dev-loop clearly: `bun run convex:dev` (or via turbo `dev`) in one terminal, `bun run mission run` in another. When Convex moves to cloud later, only the URL/key change.
- **Convex deploy keys**: `.sandcastle/.env` is gitignored. Local dev keys are low-risk; rotate in cloud era.
- **GitHub PR linkage**: PRs no longer auto-close issues. Convex tracks PR URL per feature; acceptable v1 trade-off.
- **`events` document size**: Convex 1MB limit. Acceptable at expected volume; prune or archive if a mission exceeds 1k events.
- **Codex CLI auth dir**: confirm `~/.codex` exists and is bind-mountable. If Codex stores creds elsewhere on macOS, update Dockerfile.
- **`@ai-hero/sandcastle` API**: function `run({...})`, not a method. Project uses `.ts`, not `.mts`.
- **Path glob matching**: `picomatch` for `pathsOwned` overlap — verify reachable as direct dep or add.
- **Script-name collision avoided**: CLI is `mission`, not `sandcastle`.
- **Schema is reactive-ready**: a future dashboard slots in as a route in this same workspace, importing `apps/missions/convex/_generated/api`. No migration required.
