# TASK

Open a pull request for branch `{{BRANCH}}` (issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}).

# CONTEXT

<diff-to-main>

!`git diff main..HEAD --stat`

</diff-to-main>

<recent-commits>

!`git log -n 5 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

<sub-issues>

Sub-issues that reference issue #{{ISSUE_NUMBER}} as their parent. This PR is expected to close every one of them — the workflow is one PRD = one PR = all sub-issues closed.

!`gh issue list --search "in:body #{{ISSUE_NUMBER}} parent" --state open --json number,title --jq '.[] | "- #\(.number): \(.title)"'`

</sub-issues>

# STEPS

1. Push the branch: `git push -u origin {{BRANCH}}`
2. Open a PR with `gh pr create`. The body MUST include:
   - A short summary of the change (1–3 bullet points based on the diff/commits above)
   - The line `Closes #{{ISSUE_NUMBER}}` so merging the PR auto-closes the parent issue
   - One `Closes #N` line for every sub-issue listed in <sub-issues> above (the workflow is whole-PRD PRs, so all listed sub-issues should be closed by this PR)
3. Print the resulting PR URL.

Do NOT merge the PR. Do NOT close the issue manually. The human reviewer handles landing.

Once the PR is open, output <promise>COMPLETE</promise>.
