# Agentic Exploratory Testing (Layer 3)

The QA agent uses `agent-browser` and Playwright to explore the running Electron app, discover untested flows, and generate new `.spec.ts` files for anything not yet covered.

## Prerequisites

- Built desktop app: `cd apps/desktop && bun run build`
- `agent-browser` installed globally: `npm i -g agent-browser`
- Playwright installed: `cd apps/desktop && bun install`

## On-demand run

```bash
# From repo root
cd apps/desktop
E2E=1 bun run test:e2e
```

This runs all suites under `e2e/`. To run a single spec:

```bash
cd apps/desktop
E2E=1 npx playwright test e2e/theme-sidebar.spec.ts
```

## Triggering an exploratory heartbeat

The QA agent (Columbo / CQO) accepts a Paperclip task with the title:

> "Explore Contexture, find any broken flows, and output new `.spec.ts` test cases for anything not yet covered"

The agent will:
1. Check out the task and create a branch `paperclip/ONT-NNN-exploratory-<date>`
2. Launch Electron via `E2E=1 bun run test:e2e` and run existing suites to confirm baseline
3. Inspect source code (components, IPC handlers, menu items) for flows not covered by existing specs
4. Write new `e2e/*.spec.ts` files for each discovered flow
5. Open a PR with the new specs and a findings comment

## Nightly schedule (optional)

Add a cron trigger in `.github/workflows/ci.yml`:

```yaml
on:
  schedule:
    - cron: '0 3 * * *'   # 03:00 UTC every night
```

This runs `bun run test:e2e` in CI against a freshly-built app. Failures create a Paperclip task assigned to the QA agent.

## Output convention

Each exploratory run produces:

| Artifact | Location |
|---|---|
| New spec files | `apps/desktop/e2e/<flow-name>.spec.ts` |
| Findings summary | PR body + Paperclip issue comment |
| Screenshots (on failure) | `apps/desktop/test-results/artifacts/` |

## Visual regression baselines

Screenshots are taken with:

```bash
npx playwright test --update-snapshots
```

Baseline images are committed to `apps/desktop/e2e/snapshots/` and compared on each CI run. On release tag, baselines are refreshed automatically via the release workflow.

## Coverage discovered in first exploratory run (2026-03-31)

Static analysis of the Contexture codebase revealed the following flows not covered by the original three specs (`app-launch`, `ontology-crud`, `import-export`):

| Flow | New spec | Notes |
|---|---|---|
| Theme toggle (sun/moon icon swap) | `theme-sidebar.spec.ts` | Toggle is idempotent |
| Sidebar panel toggle | `theme-sidebar.spec.ts` | Conditional on ontology loaded |
| Cmd+F → search focus | `search.spec.ts` | Keyboard shortcut via `GraphSearchBar` |
| Search results dropdown | `search.spec.ts` | Fuzzy match against loaded classes |
| Graph canvas node rendering | `graph-controls.spec.ts` | `.react-flow__node` count |
| Graph legend visibility | `graph-controls.spec.ts` | Conditional on component markup |
| Cmd+N (new ontology) | `file-menu.spec.ts` | Clears graph or shows confirmation |
| Cmd+S / Cmd+Shift+S | `file-menu.spec.ts` | Verified in import-export; promoted to dedicated spec |
| Cmd+O (open file) | `file-menu.spec.ts` | Native dialog dismissed with Escape |

**Not yet covered** (future exploratory runs):
- Chat panel (AI-driven ontology edits via `useClaude` / `ChatPanel`)
- Detail panel (class/edge inspector on node click)
- Context menu (right-click on graph node)
- Metrics panel
- Validation panel
- Update banner
- Eval panel
