# ADR 0006: Versioned IR with a migration chain, even when empty

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

`.contexture.json` is a user-owned, source-of-truth file checked into the user's repo. It will outlive any specific Contexture release. The IR shape will change: new TypeDef kinds, new field constraints, new import forms. When it does, a user opening an old file in a new editor must succeed.

If we don't bake versioning in from v1, the first breaking change becomes a coordination problem: detect old shape heuristically, branch the loader, communicate the upgrade.

## Decision

Every `.contexture.json` carries `version: '1'`. The loader walks a registered migration chain (`packages/core/src/migrations`) before the Zod meta-schema runs. Each migration declares `from`/`to`/`migrate`/`warning`. The chain is empty at v1 — the scaffold exists so future bumps slot in by appending one entry.

The loader returns warnings alongside the migrated schema so the UI can surface "we upgraded this file" notices.

## Consequences

- Zero work today; future migrations are append-only and isolated.
- Round-trip is preserved — `save()` always writes the current version, so opening an old file once upgrades it on next save.
- The version field is asserted by Zod (`z.literal('1')`), so unknown future versions opened in older editors fail loudly with a clear path.

## Alternatives considered

- **No version field, infer shape:** works for one breaking change, then becomes a maze.
- **SemVer for the IR:** overkill — IR shapes don't have minor/patch distinctions; either it parses or it doesn't.
- **Migrate lazily during ops:** mixes the responsibilities of "load this file" and "apply this op", and means partial migrations can persist on disk.
