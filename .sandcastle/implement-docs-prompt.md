# TASK

Resolve documentation issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}.

Pull in the issue using `gh issue view {{ISSUE_NUMBER}} --json number,title,body,labels,comments,state,author`. If it has a parent PRD, pull that in the same way.

Only work on the issue specified.

Work on branch {{BRANCH}}. This is a documentation-only change — markdown files only. Do not touch source code.

# EXECUTION

1. Read the relevant docs and the issue.
2. Make the documentation edits.
3. Re-read what you wrote — does it actually answer the issue? Is anything inaccurate compared to current code?
4. No tests, no `bun run ci` — pure docs.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Reference the issue (e.g. `RALPH: Update README sandcastle section (issue #{{ISSUE_NUMBER}})`)

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the GitHub issue with what was done. Do not close the issue — the merged PR will close it automatically.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK. ONLY EDIT DOCUMENTATION (`.md` files).
