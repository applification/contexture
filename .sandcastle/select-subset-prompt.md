# TASK

You are choosing a subset of pre-filtered candidate issues that the harness can safely work on **in parallel** this iteration.

The deterministic eligibility filter has already excluded:

- Issues without the `{{LABEL}}` label
- Issues already claimed by an open PR (`Closes #N` / `Fixes #N` / `Resolves #N`)

Your only remaining job is **conflict avoidance**: pick the largest subset (up to `{{MAX_PARALLEL}}`) of candidates whose work is unlikely to collide.

# CANDIDATES

These issues are eligible. Their branch names are pre-assigned and must not be changed.

<candidates-json>
{{CANDIDATES_JSON}}
</candidates-json>

# CONFLICT HEURISTICS

Reject pairs that look likely to merge-conflict or step on each other:

- Both issues mention the same source files or modules in their bodies/titles
- One issue's success requires API or data shapes the other will introduce
- Both issues touch the same PRD's implementation surface

When in doubt, prefer fewer issues over more. A wasted parallel slot costs less than two agents stomping on the same file.

# OUTPUT

Output your selection as JSON wrapped in `<plan>` tags. The shape **must** match the candidates' shape exactly — preserve `number`, `title`, `branch`, and `labels` for every chosen issue.

<plan>
{"issues": [{"number": 42, "title": "Fix auth bug", "branch": "sandcastle/issue-42-fix-auth-bug", "labels": ["bug", "{{LABEL}}"]}]}
</plan>

If no candidates are safe to run together, return the single highest-priority one (the one whose body shows the strongest signal of being self-contained).
