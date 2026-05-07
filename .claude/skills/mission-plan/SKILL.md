---
name: mission-plan
description: Turn an open-ended objective into a structured Missions plan (milestones + features + dependencies + path ownership) for the Contexture orchestrator. Use when the user wants to plan a multi-feature mission and have agents execute it.
---

You are turning a free-form objective into a structured `MissionPlan` that the orchestrator can execute. You will:

1. **Grill the user** until the objective is unambiguous and properly scoped.
2. **Emit a JSON plan** matching the schema in [`schema-reference.md`](schema-reference.md).

Do not skip step 1. A bad plan compounds — every feature in a mission is acted on by an autonomous agent. Five minutes of clarifying questions saves hours of wasted runs.

## Step 1: Grill until unambiguous

Ask, in order, whatever you don't already know from context:

- **What outcome does this mission deliver?** Push for a single sentence.
- **What's done at the end?** Concrete acceptance criteria (e.g. "Convex schema emit works for the existing IR test fixtures and `bun run ci` is clean").
- **Where does the work live?** Specific paths or globs (e.g. `packages/core/src/emit-convex/**`). This drives `pathsOwned` and lets the scheduler parallelise safely.
- **What's the natural ordering?** Identify dependencies between sub-tasks. If two features can be done in parallel, say so explicitly.
- **What's the right milestone boundary?** A milestone is a checkpoint where the integrated state must pass `bun run ci` and a validator agent's success criteria. Don't put unrelated work in the same milestone.
- **Which agent should do what?** Default `claude` for most coding work. Use `codex` if the user has a preference for a specific feature.
- **Skill references** — does any feature need particular knowledge (e.g. `frontend`, `backend`, `db`, `tests`)? Available skills are in `.sandcastle/missions/skills/`.

Stop asking when you can write a plan that:

- Has at least one milestone.
- Each milestone has at least one feature.
- Every feature has a non-trivial prompt that an agent could act on autonomously, owned paths, and explicit dependencies.
- Success criteria are testable (`bun run ci` clean, specific commands pass, explicit assertions).

If the user pushes back on a question, take their answer and move on. Don't loop.

## Step 2: Emit the plan

Output the plan as a single JSON code block fenced with ` ```json `. Match the schema in [`schema-reference.md`](schema-reference.md) exactly — the orchestrator validates it with Zod and rejects anything malformed.

After the code block, add a one-paragraph summary of what you've planned, why you grouped features into milestones the way you did, and any assumptions you made.

If the user invoked you headlessly via `bun run mission plan "<objective>"`, the orchestrator will capture the JSON code block, validate it, and insert the mission into Convex. Do not write any files yourself.

If the user invoked you interactively (`/mission-plan`), the user will save the JSON to a file and then run `bun run mission plan --apply <path>` to ingest it.

## Conventions

- `slug` fields: lowercase letters, digits, hyphens. Used in branch names (`mission/<missionSlug>/<featureSlug>`).
- `pathsOwned`: glob patterns. Used for path-conflict detection — features whose owned paths overlap will be serialised, not run in parallel. Be precise: `packages/core/**` is too broad if only `packages/core/src/emit-convex/**` is touched.
- `dependencies`: feature slugs (within the same mission) that must finish before this one starts.
- `successCriteria`: concrete, testable statements. The validator agent at the milestone gate evaluates these.
- `validationPrompt`: instructions to the validator agent — what to run, what to look at, what counts as pass/fail.
