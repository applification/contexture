# Goal 5: Onboarding

## Objective

Help a new Convex developer reach the first trusted Contexture loop quickly: model a small domain change, emit Convex outputs, and see drift clean.

Onboarding should explain a strong product, not compensate for an unfinished one.

## Product Promise

Open Contexture, create or inspect a Convex model, generate the files your app imports, and understand how agents can safely help.

## Why This Matters

Onboarding is lower priority than the core workflows, but it will eventually decide whether the product's strengths are legible.

The first-run experience should make the product feel concrete:

- this is for Convex apps
- this is the source model
- these are generated files
- this is how drift stays clean
- this is how agents can change the model safely

## Scope

- Add first-run and empty-state paths around the Convex loop.
- Provide a realistic sample model.
- Explain generated outputs and drift through doing, not a tour.
- Defer broad import/project detection until the core experience is strong.

## Key Work

### Start Screen

- Offer clear entry points:
  - create new Convex model
  - open existing `.contexture.json`
  - open recent model
  - inspect sample Convex model
- Keep the start screen task-oriented.
- Avoid a marketing-style landing page inside the app.

### Sample Model

- Provide a small but realistic Convex app domain.
- Include tables, refs, enums, indexes, and generated outputs.
- Make the sample good enough to demonstrate real workflows, not just UI decoration.
- Use sample copy and naming that helps users infer best practices.

### Guided First Loop

- Create or open a Convex model.
- Add a table.
- Add fields.
- Add a ref.
- Add an index.
- Emit Convex schema and validators.
- Check drift clean.
- Optionally show how an agent would make a similar change.

### Generated Output Explanation

- Show what files will be generated.
- Show that generated files are disposable outputs from the IR.
- Explain drift through status and review surfaces, not long prose.
- Make it easy to open generated files in the user's editor.

### Agent Introduction

- Introduce the agent as a constrained model collaborator.
- Show that agent changes go through ops.
- Demonstrate validation and oversight on a small change.
- Avoid making AI setup the first required step.

## UX Principles

- Onboarding should produce a real artifact.
- It should not block experienced users.
- It should teach the product loop by performing it.
- It should avoid explaining every concept up front.

## Success Criteria

- A new user can get from empty app to generated Convex files without reading docs.
- The user understands that `.contexture.json` is the source of truth.
- The user sees drift clean after generation.
- The user understands that agent changes are supervised through Contexture ops.
- Returning users can skip onboarding and go straight to work.

## Non-Goals

- Do not build onboarding before the Convex authoring loop is genuinely strong.
- Do not require account setup or AI provider setup for the first product success.
- Do not build full Convex project import as part of the initial onboarding goal.
- Do not bury the working app behind a tutorial.

## Dependencies

- Convex-first product direction.
- Strong model authoring flows.
- Reliable Convex generation and drift checks.
- Agent oversight UX, at least enough to demonstrate the trust model.

## Priority

Later. Important, but it should be built around the proven core workflows from goals 1 through 4.
