# @contexture/missions

Convex deployment for the Missions orchestrator. v1 runs `convex --local` (no cloud account needed); the schema is identical when promoted to cloud later.

## Local dev

```bash
bun run dev
```

This starts `convex dev --local`, which:

- Downloads a Convex backend binary the first time
- Configures a local deployment at `http://127.0.0.1:3210`
- Writes `.env.local` (gitignored) with `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `CONVEX_SITE_URL`
- Watches `convex/` and reapplies schema + functions on save
- Generates types in `convex/_generated/`

The orchestrator (`.sandcastle/missions/orchestrator.ts`) reads `CONVEX_URL` from `.sandcastle/.env`. For local dev, copy the value from `apps/missions/.env.local`.

## Tests

```bash
bun run test
```

Uses [`convex-test`](https://www.npmjs.com/package/convex-test) — runs an in-memory mock of the Convex runtime; no live deployment needed.

## Schema

| Table | Purpose |
|---|---|
| `missions` | One row per mission (slug, title, objective, status) |
| `milestones` | Ordered list per mission, with success criteria + validation prompt |
| `features` | The unit of agent work. Status, deps, owned paths, branch, PR url |
| `runs` | Per-agent-invocation record (worker, reviewer, fixer, validator, replanner) |
| `events` | Append-only history of state transitions |

Every status-changing mutation also writes an `events` row so the audit trail is canonical.
