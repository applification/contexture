---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable vertical slices recorded as a checklist inside the parent PRD body. Use when user wants to break a PRD or plan down into actionable slices.
---

# To Issues

Break a plan into independently-grabbable vertical slices (tracer bullets) and record them as a checklist inside the parent PRD body — slices are NOT created as separate GitHub issues. Triage continues to operate at the PRD level.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the slices into the PRD body

Slices live **inside the parent PRD** as a checklist, not as separate issues. Edit the parent PRD's body to add (or replace) an `## Implementation Slices` section using the template below. Do NOT create new issues for slices.

Use `gh issue edit <prd-number> --body-file <file>` to update the PRD. Read the current body first, splice in / replace the `## Implementation Slices` section, leave everything else untouched.

If the source was not an existing PRD issue (no parent to edit), fall back to writing the slices into whatever document the user provided, or ask the user where they want them.

<slices-template>
## Implementation Slices

### Slice 1 — <short title> (AFK | HITL)

- [ ] **What to build**: concise end-to-end description (1–3 sentences).
- [ ] **Acceptance**:
  - Criterion 1
  - Criterion 2
- [ ] **Blocked by**: None — can start immediately.

### Slice 2 — <short title> (AFK | HITL)

- [ ] **What to build**: ...
- [ ] **Acceptance**:
  - ...
- [ ] **Blocked by**: Slice 1.

</slices-template>

Notes on the template:

- Each slice is one `###` subsection so it stays scannable but keeps enough context (what / acceptance / blocked-by) to be actioned without re-reading the PRD.
- "Blocked by" references other slices by their slice number within this PRD. If a slice later gets promoted to a real issue, the reference here will not auto-update — that drift is acceptable.
- Triage continues to operate at the PRD level. Slices are not separately triaged.

### 6. Promotion (out of scope for this skill)

When work on a slice begins, the slice may be promoted to a real GitHub issue manually (via the "Convert to issue" affordance on the checkbox, or by hand). This skill does not perform promotion.

Do NOT close or modify any parent issue beyond editing the body to add the `## Implementation Slices` section.
