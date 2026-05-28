# Goal 1: Convex-First Offering

## Objective

Make Contexture feel like the best way to design, evolve, and keep trust in the domain model for a Convex app.

Contexture should lead with Convex for now. TypeScript, Zod, JSON Schema, structured outputs, MCP definitions, and form validators remain useful supporting outputs, but the product story should be anchored on Convex app builders.

## Product Promise

Design your Convex domain model visually, generate Convex schema and validators, and let agents evolve the model safely through reviewable operations.

## Why This Matters

Convex gives Contexture a concrete wedge:

- Convex apps have an explicit schema surface.
- Builders often move quickly and need to reshape data models often.
- Agent-assisted development is a natural fit for Convex's full-stack app workflow.
- Generated schema and validators create a clear trust boundary.
- A Convex-specific product is easier to understand than a generic TypeScript modeling tool.

## Scope

- Make Convex the default product lens in app surfaces, docs, and marketing.
- Promote table modeling, refs, indexes, schema generation, and validators.
- Treat non-Convex outputs as secondary artifacts.
- Add Convex-specific validation, modeling hints, and review flows where useful.
- Preserve the general Contexture IR architecture so broader TypeScript support can remain available later.

## Key Work

### Product Positioning

- Update product copy to say "for Convex apps" clearly.
- Reframe generated outputs around `convex/schema.ts` and `convex/validators.ts`.
- Keep Zod, JSON Schema, and AI outputs visible as supporting contracts, not the primary pitch.
- Make the website hero, feature order, and examples Convex-first.

### App Surface

- Make Convex outputs first-class in the schema/output panel.
- Show where generated Convex files will be written.
- Explain which model types become Convex tables.
- Show a concise table/index summary for Convex-mode models.
- Add Convex-specific empty states and sample data.

### Modeling Semantics

- Strengthen support for table types.
- Improve refs as a first-class relationship concept.
- Make indexes easy to define, inspect, and review.
- Add Convex-specific warnings for unsupported or risky modeling patterns.
- Add hints for common Convex modeling choices, such as lookup indexes and ref fields.

### Generated Targets

- Treat `convex/schema.ts` and `convex/validators.ts` as primary generated targets.
- Keep emission deterministic and reviewable.
- Ensure generated Convex output stays clean under drift checks.
- Make emitted file paths obvious before generation.

## UX Principles

- A Convex developer should understand the product in seconds.
- Convex concepts should appear in user-facing language.
- Contexture should not pretend to own application code beyond generated artifacts.
- The UI should keep the source of truth obvious: the IR owns the model; Convex files are generated from it.

## Success Criteria

- A Convex developer can explain Contexture's value after viewing the homepage or opening the app.
- A user can create a small Convex domain model with tables, refs, fields, and indexes.
- The user can emit Convex schema and validators and see drift clean.
- The app makes it clear which generated files are owned by Contexture.
- The product no longer feels like a generic schema editor with Convex as one output.

## Non-Goals

- Do not remove TypeScript or AI-oriented outputs.
- Do not make Contexture mutate arbitrary Convex app code.
- Do not build a full Convex project generator before the modeling loop is excellent.
- Do not let onboarding work displace the core Convex modeling experience.

## Dependencies

- Existing generated Convex targets.
- Existing IR, op applier, semantic validation, and drift manifest.
- Model authoring improvements for fields, refs, tables, and indexes.
- Reconcile improvements for generated Convex drift.

## Priority

Highest. This goal sharpens the whole product and should guide the next product decisions.

## Implementation Plan

### Working Thesis

Goal 1 is mostly a product-shaping goal, not a large new subsystem. The repo already has meaningful Convex capability: generated `convex/schema.ts`, generated `convex/validators.ts`, table flags, index editing, Convex emit tests, drift paths, and semantic validation for duplicate table names.

The implementation should therefore make Convex the default story and primary path through the existing product, while deferring deeper authoring and reconcile upgrades to Goals 2 and 3.

### Current Gaps

- `DESIGN.md` and the `/brand` page still describe Contexture as a Zod-first product.
- The top-level README still leads with "AI-native TypeScript apps."
- The desktop README still describes Contexture as a "Zod schema editor."
- The desktop empty state says "Visual Zod schema editor."
- The schema panel defaults to Zod-first ordering and copy in several places.
- The marketing homepage leads with TypeScript contracts and generic domain models.
- The website feature order treats Convex as one generated output among many.
- The agent demo asks for generic app contracts instead of Convex schema and validators.
- The generated-output panel does not explicitly frame `convex/schema.ts` and `convex/validators.ts` as the primary outputs for Convex projects.
- The app has Convex table and index controls, but the product shell does not yet make those feel like the main path.

### Slice 0: Update Brand And Design-System Source Of Truth

Objective: make the design-system and brand references agree with the Convex-first product direction before product surfaces are rewritten around that direction.

Changes:

- Update `DESIGN.md` so Contexture is no longer defined as a visual Zod schema editor.
- Keep the tagline "Where schemas take shape." available where a tagline is needed.
- Preserve the established visual posture:
  - precise, confident, approachable, builder-oriented
  - dark-first
  - deep indigo foundations
  - electric cyan accents used deliberately
  - dense, calm builder-tool ergonomics
- Update `/brand` copy so the public brand reference leads with Convex app modeling.
- Reframe Zod and JSON Schema as supporting generated contracts.
- Keep the brand page visually consistent with the existing token, typography, logo, and component rules.

Acceptance criteria:

- The design-system source no longer contradicts the Convex-first product direction.
- The brand page reads as Contexture for Convex app models, not generic TypeScript schemas.
- Existing brand fundamentals remain intact.

Verification:

- Search `DESIGN.md` and `/brand` for stale Zod-primary and TypeScript-primary positioning.
- Check `/brand` at desktop and mobile widths if visual layout changes.

### Slice 1: Reposition Product Copy Around Convex

Objective: make the repo, website, and app copy say the same thing: Contexture is currently for Convex app models.

Changes:

- Update the root README opening:
  - From: domain-model control plane for AI-native TypeScript apps.
  - To: domain-model control plane for Convex apps built with agents.
- Reorder the generated-output list to lead with Convex schema and validators.
- Update the desktop README:
  - Replace "Visual Zod schema editor" positioning.
  - Describe the desktop app as a Convex model editor with generated schema, validators, and agent-safe ops.
- Update desktop empty states:
  - Replace "Visual Zod schema editor" with Convex-first copy.
  - Prefer "Convex model" and "generated Convex outputs" where accurate.
- Update status/help copy where it still frames Zod as the primary artifact.

Acceptance criteria:

- A repo visitor sees Convex in the first paragraph of the root README.
- A desktop user no longer sees Zod described as the product category.
- Existing Zod/JSON Schema outputs remain documented as supporting outputs.
- Product copy does not imply Contexture owns arbitrary Convex app code beyond generated artifacts.

Verification:

- Focused text assertions where existing tests cover copy.
- `rg "Zod schema editor|AI-native TypeScript apps|Visual Zod"` returns no primary-positioning copy.

### Slice 2: Make The Marketing Homepage Convex-First

Objective: make the website immediately legible to Convex developers.

Changes:

- Update hero eyebrow from generic "Desktop app + MCP server" to a Convex-specific framing.
- Update hero headline/supporting copy to mention Convex apps, `convex/schema.ts`, validators, and agent-safe model changes.
- Ensure the first viewport includes Convex-specific product evidence, not only Convex-specific copy:
  - visible table/ref/index modeling, or
  - visible `convex/schema.ts`, or
  - visible `convex/validators.ts`, or
  - visible drift-clean evidence for generated Convex files.
- Reorder feature cards so Convex schema and validators appear before generic generated contracts.
- Update the agent conversation demo:
  - User asks to change a Convex table/model.
  - Steps emit Convex schema and validators.
  - Final state mentions drift clean for generated Convex files.
- Update generated-surface section:
  - Prefer Convex screenshots or generated-output artifacts.
  - If screenshots are still Zod-oriented, this slice should either update the visual or explicitly create a follow-up issue before merge.
- Update use-case cards:
  - Promote Convex app schemas.
  - Keep structured output and agent workflows as secondary use cases.

Acceptance criteria:

- The first viewport clearly says Contexture is for Convex app models.
- The first viewport shows Convex-specific product proof.
- The feature order matches the Goal 1 priority.
- The agent demo no longer reads like a generic TypeScript contract demo.

Verification:

- Existing web component/e2e tests updated for new copy.
- `bun run test` from `apps/web` or focused affected tests.
- Playwright screenshots for homepage at mobile, tablet, and desktop.
- Verify hero readability, CTA visibility, no text overlap, and reduced-motion behavior.

### Slice 3: Make Convex Outputs Primary In The Schema Panel

Objective: make the in-app generated-output surface feel Convex-first without removing other outputs.

Changes:

- Adjust generated-target metadata/order so Convex schema and validators are shown before Zod/JSON Schema in the core group.
- Split output groups into:
  - Convex
  - Supporting contracts
  - Agent and form targets
- Update labels/help:
  - `Convex schema`: primary database schema generated from table types.
  - `Convex validators`: reusable validators for functions and form boundaries.
  - Zod/JSON Schema: supporting contracts.
- Make the default selected generated output Convex schema when it is enabled.
- Ensure `convex/validators.ts` is visible as a first-class generated target, not hidden behind the shared Convex output toggle.
- Show generated file path, enabled/disabled state, and ownership wording for each output.
- Provide direct selection for both `convex/schema.ts` and `convex/validators.ts`.
- Keep optional outputs configurable, but avoid making the user hunt for the Convex files.

Acceptance criteria:

- Opening the schema panel in a normal bundle shows Convex schema first.
- Users can switch to Convex validators directly.
- Zod and JSON Schema remain available.
- Generated file paths for `convex/schema.ts` and `convex/validators.ts` are visible.
- Keyboard users can move through output groups and select Convex schema or validators.

Verification:

- Update `SchemaPanel` tests for default output, ordering, labels, and file path.
- Keyboard path through output selector, output config, file-path disclosure, and open-generated action.
- Run focused desktop component tests for `SchemaPanel`.

### Slice 4: Surface Convex Model Shape In The App Shell

Objective: make users see their model as a Convex app model, not only a generic graph.

Changes:

- Add concise Convex model counts where useful:
  - tables
  - object types
  - refs
  - indexes
- Prefer this in the status bar or schema/detail side panel, not as noisy canvas chrome.
- Counts must use text labels and accessible names; do not rely on color, icon-only meaning, or `title` attributes.
- If counts are interactive, details must be keyboard reachable.
- Update empty bundle copy to mention generated Convex outputs.
- In type details, keep table/index controls prominent.
- Add small explanatory copy for what becomes a Convex table if current copy is still too implicit.

Acceptance criteria:

- A user can tell how many Convex tables/indexes are in the current model.
- A selected object type clearly exposes whether it is a Convex table.
- The app shell reinforces Convex concepts without cluttering the graph.
- Screen-reader users can understand the same model summary as sighted users.

Verification:

- Focused component tests for status/detail copy if changed.
- Screen-reader/keyboard pass for status counts, table toggle, and index controls.
- Manual smoke in desktop dev app if UI layout changes are non-trivial.

### Slice 5: Strengthen Convex-Specific Validation And Hints

Objective: make Convex-specific modeling constraints visible before emit failures surprise the user.

Changes:

- Audit current Convex validation coverage:
  - duplicate table names
  - reserved table names
  - reserved field names
  - invalid index field references
  - empty index fields
  - unsupported field types for Convex emit
- Move any emitter-only Convex failures that users can reasonably fix into semantic validation or modeling hints.
- Add or improve modeling hints for common Convex patterns:
  - ref fields often need lookup indexes
  - stable slug/name fields are good index candidates
  - table names should match product language
- Define a severity model:
  - blocking errors: invalid model or generated Convex output would fail
  - warnings: model is valid but likely surprising or risky
  - hints: advisory modeling guidance
- Display issues both near the relevant table/index control and in a summary surface before emit.
- Avoid relying on `title` attributes alone for warnings or errors.
- Keep hints advisory unless the generated output would be invalid.

Acceptance criteria:

- Common Convex emit failures are caught before the user gets to generated output.
- Hints help users model Convex tables/indexes without reading docs.
- The semantic gate protects agent-authored Convex changes too.
- Blocking errors, warnings, and hints are visually and semantically distinguishable.

Verification:

- Core semantic validation tests.
- Desktop validation service tests if renderer-level presentation changes.
- Accessibility pass for validation summary, inline errors, and focus movement from summary to affected control.
- Existing Convex emit tests continue to pass.

### Slice 6: Align Agent And MCP Copy With Convex

Objective: make the agent collaboration story specific to Convex model evolution.

Changes:

- Update system prompt/product copy from Zod schema language to Convex/domain-model language where appropriate.
- Keep "do not respond with TypeScript/Zod code" style constraints if technically needed, but make the task framing Convex-first.
- Keep implementation terms such as "closed-world ops" and "op-based schema mutation" internal or secondary.
- Prefer user-facing language:
  - agents propose reviewable model changes
  - agents update Convex tables, refs, and indexes
  - agents emit generated Convex files
  - drift checks confirm generated files still match the model
- Add example prompts/copy such as:
  - "Ask an agent to add a `memberships` table with refs to `users` and `teams`."
  - "Review the model change before emitting `convex/schema.ts` and `convex/validators.ts`."
  - "Run drift checks to confirm generated Convex files still match the model."
- Update chat empty states and examples to ask for Convex table/ref/index changes.
- Update MCP setup copy so the outcome is "inspect, mutate, emit Convex outputs, check drift."

Acceptance criteria:

- The agent is introduced as a Convex model collaborator.
- The prompts still enforce op-based schema mutation.
- Tests that snapshot system prompts are updated intentionally.
- User-facing copy is understandable without knowing Contexture's internal op vocabulary.

Verification:

- `apps/desktop/tests/chat/system-prompt.test.ts`.
- Any affected chat empty-state tests.

### Slice 7: Final Consistency Pass

Objective: remove product-positioning drift introduced by old language.

Changes:

- Run text searches for old positioning:
  - `Zod schema editor`
  - `AI-native TypeScript apps`
  - `generated TypeScript contracts`
  - `app contracts`
  - `one model, many consumers`
- Include:
  - `DESIGN.md`
  - `/brand`
  - homepage copy
  - app empty states
  - screenshots alt text
  - chat examples
  - MCP setup copy
  - tests and snapshots
- Decide case by case:
  - replace if it is product framing
  - keep if it describes a literal technical output
- Check docs, app copy, tests, website copy, and screenshots alt text.

Acceptance criteria:

- Convex is the lead story.
- TypeScript/Zod are still present only as supporting technical outputs.
- There is no accidental claim that Contexture owns arbitrary Convex app code.

Verification:

- `bun run typecheck`
- focused tests for changed packages
- `bun run ci` before merge if the implementation touches app and web surfaces
- Screenshot comparison or manual visual pass for web and desktop surfaces touched by the goal.

## Suggested Execution Order

1. Slice 0: Update brand and design-system source of truth.
2. Slice 1: Reposition product copy around Convex.
3. Slice 2: Make the marketing homepage Convex-first.
4. Slice 3: Make Convex outputs primary in the schema panel.
5. Slice 4: Surface Convex model shape in the app shell.
6. Slice 5: Strengthen Convex-specific validation and hints.
7. Slice 6: Align agent and MCP copy with Convex.
8. Slice 7: Final consistency pass.

This order starts with fast product clarity, then moves into app behavior, then hardens the model semantics that make the positioning true.

## Goal 1 Completion Bar

Goal 1 is complete when a Convex developer can open the website or app and immediately understand:

- Contexture is for Convex app domain models.
- The IR is the source of truth.
- `convex/schema.ts` and `convex/validators.ts` are primary generated outputs.
- Agents can change the model through constrained operations.
- Drift checks prove generated Convex files still match the model.

At that point, Goals 2 and 3 can deepen the actual authoring and reconcile workflows without fighting unclear positioning.
