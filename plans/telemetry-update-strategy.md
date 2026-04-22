# Contexture — Telemetry & Update-Channel Strategy

Decision record for issue #76 (Phase 0 HITL). Consumed by Phase 3 release work.

---

## Decisions

### 1. Sentry: **fresh project**

A new Sentry project (and therefore a new DSN) will be provisioned for
Contexture. Ontograph's Sentry project is left untouched for any legacy
v0.14.x installs still reporting.

**Rationale.** Error baselines, alert thresholds, and release health for
Contexture must not be mixed with Ontograph telemetry. Ontograph and
Contexture have different code paths, different failure modes, and different
user workloads — commingling events would poison both projects' metrics.

**Action for Phase 3.** Create the Sentry project, wire the new DSN through
the existing `initSentryMain` / Sentry renderer init paths, update
environment-variable names if they currently embed "ontograph".

---

### 2. PostHog: **fresh project**

A new PostHog project (and therefore a new project API key) will be
provisioned for Contexture. Ontograph's PostHog project is left untouched.

**Rationale.** Funnels, retention cohorts, and event schemas are
product-specific. The Contexture user loop (schema editing, chat ops, Eval
samples) has essentially no overlap with the Ontograph loop (OWL class
editing, ontology validation). Sharing a project would make every funnel
ambiguous.

**Action for Phase 3.** Create the PostHog project, update the env var used
by the desktop and web PostHog providers. The op-level event schema (flagged
as an open item in pivot.md §Further Notes) is tracked separately.

---

### 3. Update feed: **GitHub releases on `applification/contexture`**

Contexture will ship via `electron-builder`'s GitHub provider pointed at
`applification/contexture` (the new repo, created in #78).

```yaml
# apps/desktop/electron-builder.yml (post-#77/#78)
publish:
  provider: github
  owner: applification
  repo: contexture
  releaseType: release
```

**Rationale.** Matches the repo move in #78, avoids hosting infrastructure,
and reuses the update pipeline the Ontograph app already depends on. No
reason to introduce a bespoke feed server for v1.

**Action for #77 / #78 / Phase 3.** `electron-builder.yml` `publish.owner`
and `publish.repo` are bumped in the Phase 1 rename set, re-validated after
the repo move, and confirmed live by the Phase 3 release gate.

---

### 4. No auto-upgrade from Ontograph v0.14.x: **confirmed**

Ontograph v0.14.x installs continue to check the `DaveHudson/Ontograph`
releases feed. Contexture is a **fresh install** with its own `appId`
(changes in #77 — e.g. `com.applification.contexture`), its own update feed
(as above), and its own Sentry/PostHog projects. There is no in-place
migration path, no silent binary swap, and no shared auto-update channel.

This confirms user story #41 in pivot.md / #74.

**Rationale.** The two products have different data formats
(`.ttl`/`.rdf`/`.owl`/`.jsonld` vs `.contexture.json`), different mental
models (open-world OWL vs closed-world Zod), and different dependency sets.
An in-place upgrade would either (a) silently break users whose files
Ontograph can open but Contexture cannot, or (b) require a v0.14.x → v1.0.0
migration tool that is out of scope. An explicit fresh install gives users
the choice.

**User-facing implication.** The download page for Contexture v1.0.0 should
state clearly that it is a new app, not an upgrade, and link to Ontograph
legacy builds for users who need to keep editing `.ttl` files. Copy work
belongs to Phase 3.

---

## Summary table

| Channel               | Decision                         | Changes to land in                     |
| --------------------- | -------------------------------- | -------------------------------------- |
| Sentry                | fresh project + new DSN          | Phase 3 (env var swap)                 |
| PostHog               | fresh project + new API key      | Phase 3 (env var swap)                 |
| Auto-update feed      | GitHub: `applification/contexture` | #77 (electron-builder.yml) + #78 (repo) |
| Ontograph v0.14.x path | no auto-upgrade                  | Phase 3 download-page copy             |
