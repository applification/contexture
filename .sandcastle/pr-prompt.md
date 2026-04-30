# TASK

Open a pull request for branch `{{BRANCH}}` (issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}).

# CONTEXT

<diff-to-main>

!`git diff main..HEAD --stat`

</diff-to-main>

<recent-commits>

!`git log -n 5 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# STEPS

1. Push the branch: `git push -u origin {{BRANCH}}`
2. Open a PR with `gh pr create`. The body MUST include:
   - A short summary of the change (1–3 bullet points based on the diff/commits above)
   - The line `Closes #{{ISSUE_NUMBER}}` so merging the PR auto-closes the issue
3. Print the resulting PR URL.

**Run `gh pr create` exactly once.** It is not idempotent — a second call either creates a duplicate PR or fails noisily. If the first call appears to have hung or returned no output, check `gh pr list --head {{BRANCH}}` before re-running.

Do NOT merge the PR. Do NOT close the issue manually. The human reviewer handles landing.

Once the PR is open, output <promise>COMPLETE</promise>.
