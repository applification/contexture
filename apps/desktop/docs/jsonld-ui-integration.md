# JSON-LD UI Integration Notes

This note explains how JSON-LD should appear in the desktop UX with minimal workflow changes.

## User-Facing Behavior

- Users can open `.jsonld` files from **File > Open** and drag/drop (if added later).
- Users can save ontology content as `.jsonld` from **Save As**.
- The status bar format badge shows `JSON-LD` for `.jsonld` files, matching existing `Turtle` and `RDF/XML` badges.
- Existing warning UX is reused:
  - Parse issues are surfaced via `importWarnings`.
  - Validation issues continue to show in the status bar popover.

## Integration Points

- Open/save file filters are currently defined in:
  - `apps/desktop/src/main/ipc/file.ts`
- Format badge mapping is currently defined in:
  - `apps/desktop/src/renderer/src/components/status-bar/StatusBar.tsx`
- Format registry (adapter lookup and dialog filter generation) is in:
  - `apps/desktop/src/renderer/src/model/formats/index.ts`

## UX Copy Updates

- Empty-state helper text in `App.tsx` currently says:
  - `Open an ontology (.ttl, .rdf, .owl)...`
- Update to:
  - `Open an ontology (.ttl, .rdf, .owl, .jsonld)...`

## Acceptance Criteria (UX)

- Open dialog shows a JSON-LD-specific option and `.jsonld` is accepted in "All Ontology Files".
- Save dialog allows selecting JSON-LD.
- After loading `/path/to/ontology.jsonld`, status bar shows:
  - file path
  - format badge `JSON-LD`
- No new UI panels are introduced; behavior stays consistent with Turtle and RDF/XML.
