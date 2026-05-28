# Goal 4: Agent Collaborator With Oversight

## Objective

Make the schema agent feel like a capable collaborator on Convex domain models while Contexture remains the authority over source-model changes.

The agent should be powerful, but bounded. Every meaningful model change should be reviewable, validatable, undoable, and explainable.

## Product Promise

Ask an agent to evolve your Convex model, then review the exact model operations, generated output, and drift status before trusting the result.

## Why This Matters

The strongest agent story is not that Contexture has a chat panel. It is that agents can change the model only through a controlled operation vocabulary.

That creates a trust envelope:

- agents can inspect the model
- agents can propose or apply schema ops
- invalid changes are rejected by structural and semantic gates
- generated files can be emitted and checked
- users can review the resulting model change

This is the difference between AI-assisted modeling and a chatbot that edits files optimistically.

## Scope

- Keep schema-only mode central.
- Make agent turns reviewable as model-change units.
- Give agents Convex-specific context and tools.
- Surface successful, rejected, and pending changes clearly.
- Integrate agent changes with undo, reconcile, sync, and drift.

## Key Work

### Operation-Centered Turns

- Record every agent-applied op in a readable change log.
- Group multiple ops into one agent turn.
- Show user-facing summaries such as:
  - added `Release`
  - added field `discogsReleaseId`
  - marked `Artist` as table
  - added index `bySlug`
- Preserve raw op detail for debugging and future review.

### Review And Undo

- Let users undo a whole agent turn.
- Consider before/after review for larger multi-op turns.
- Show which ops succeeded and which were rejected.
- Explain validation failures in terms both the user and agent can act on.
- Keep user-authored and agent-authored changes in the same undo/change model where practical.

### Convex-Specific Agent Tools

- Inspect tables, fields, refs, enums, and indexes.
- Suggest indexes from likely query patterns.
- Emit Convex targets.
- Check generated drift.
- Report Convex output paths.
- Prefer source IR changes over direct edits to generated Convex files.

### Provider Thread Safety

- Mark provider threads stale or desynced when model context changes underneath them.
- Avoid letting an agent continue from stale assumptions silently.
- Make thread desync visible but not alarming.
- Preserve useful chat history without pretending outdated model context is current.

### Oversight UX

- Show concise status for each agent turn:
  - "Agent proposed 5 model changes"
  - "3 applied, 2 rejected by validation"
  - "Convex schema emitted"
  - "Drift clean"
- Link from agent messages to affected model elements.
- Make generated output review available after agent-driven emits.
- Keep the human in charge of irreversible or ambiguous choices.

## UX Principles

- The agent should feel useful, not magical.
- The product should make the guardrails visible without turning every turn into bureaucracy.
- Users should be able to trust rejection as much as success.
- Agent outputs should land in the same product model as direct user edits.

## Success Criteria

- A user can ask an agent to evolve a Convex model and see exactly what changed.
- Invalid or semantically unsafe agent changes are rejected clearly.
- Users can undo an agent turn.
- Agent-driven emits and drift checks are visible in the workflow.
- Contexture feels like it is supervising agent collaboration, not hoping for the best.

## Non-Goals

- Do not give the schema agent unrestricted filesystem or shell access inside the modeling workflow.
- Do not hide raw model operations completely; they are important for trust and debugging.
- Do not optimize for every provider-specific feature before the provider-neutral contract is strong.
- Do not let chat become the only way to use the product.

## Dependencies

- Existing schema-agent provider runtime.
- Existing op applier and semantic gate.
- Existing chat history and provider thread concepts.
- Model authoring improvements that make ops map cleanly to visible model concepts.
- Reconcile and drift flows for generated output review.

## Priority

High. This becomes most valuable once Convex-first authoring and reconcile workflows are strong.
