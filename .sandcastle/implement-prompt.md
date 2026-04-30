# TASK

Fix issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view {{ISSUE_NUMBER}} --json number,title,body,labels,comments,state,author`. If it has a parent PRD, pull that in the same way. (The `--json` form avoids a GitHub `projectItems` permission error on tokens without project scope.)

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests. Do NOT push the branch, open a PR, or close the issue — a separate agent handles PR creation, and the merged PR closes the issue automatically.

# EXPLORATION

Read only what you need to make this specific change. Do not crawl the whole repo.

1. Start from the issue body — it usually names the files or modules involved. Read those.
2. Use `grep` / `rg` to find direct callers and tests of the symbols you'll change. Read the closest tests.
3. Stop exploring once you can describe the change you're about to make. If you find yourself reading unrelated code "for context", that's a signal to stop.

Avoid: opening every file in a directory, reading framework/config files unrelated to the change, fetching docs you can already see in the source.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Run `bun run ci` to ensure typecheck, tests, and lint all pass. This is mandatory — do not commit if it fails. If `bun run ci` fails before you have made any changes, the sandbox itself is broken (e.g. corrupt `node_modules`); stop and report the failure rather than committing.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the GitHub issue with what was done.

Do not close the issue — the merged PR will close it automatically via `Closes #N`.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
