# ADR 0010: SHA-256 manifest of emitted artefacts for drift detection

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The emitter pipeline writes generated files (`Foo.schema.ts`, `Foo.schema.json`, the schema-index barrel, the Convex schema) alongside the IR. Users will edit these by hand — sometimes intentionally, often by accident. We need to detect when a generated file no longer matches what the current IR would produce, so the editor can offer to re-emit (or warn before clobbering hand edits).

`mtime` on the filesystem is unreliable: git checkouts touch every file, editor "save all" updates timestamps without changing content, and timestamps don't survive zip/tar round-trips.

## Decision

`runEmitPipeline` (in `packages/core/src/pipeline.ts`) writes a manifest at `.contexture/emitted.json`:

```ts
{ version: '1', files: { [path]: sha256(content) } }
```

The drift watcher (`apps/desktop/src/main/documents/drift-watcher.ts`) compares each generated file's current SHA-256 against the manifest entry. A mismatch means the file diverged — either the IR has been edited (re-emit needed) or the generated file was hand-edited (drift to surface to the user).

## Consequences

- Drift detection is content-based and survives any operation that preserves bytes.
- The manifest is small, deterministic, and diff-friendly — `emitted.json` only changes when an emitted file's content changes.
- Cost: SHA-256 every emit. Negligible for the file sizes involved.

## Alternatives considered

- **mtime comparison:** unreliable as above.
- **Re-run the emitter and string-compare in memory:** equivalent for detection, but the manifest doubles as a record of what was emitted, useful for future migrations and for debugging "where did this file come from".
- **Embed a hash header in each emitted file:** clutters the generated source and breaks if the user reformats the file.
