## CI Checks

After pushing to a PR branch, verify CI passes before requesting review:

```bash
# Check PR status
gh pr view <number> --json statusCheckRollup --jq '.statusCheckRollup[] | [.name, .conclusion] | @tsv'

# Get failed job logs
gh run view <run-id> --log-failed | head -60
```

- If CI fails, fix the issue and push again.
- Run `bun run format:check` and `bun run lint` locally before pushing to catch issues early.
- Do not request review or mark a PR as ready while CI is failing.

## Versioning & Releases

- Semver versioning: vMAJOR.MINOR.PATCH
- Conventional commits required
- QA determines release readiness, CTO executes releases
- GitHub Actions handles build/publish on version tags (v*.*.\*)
- Never push directly to main — all work via feature branches and PRs
