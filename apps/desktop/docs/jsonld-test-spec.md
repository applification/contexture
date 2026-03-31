# JSON-LD Import/Export Test Specification

## Goal

Verify JSON-LD is supported as a third ontology format with round-trip fidelity:

- parse JSON-LD -> internal ontology model
- serialize internal ontology -> JSON-LD
- parse serialized JSON-LD -> equivalent ontology semantics

## Scope

- Unit tests:
  - adapter resolution and extension handling
  - parser warnings/errors
  - serializer output structure
  - store-level `loadFromFile` and `serializeForFilePath` behavior for `.jsonld`
- UI tests:
  - status bar format badge displays `JSON-LD`
  - open/save filters include `.jsonld`
- Fixture-based semantic checks:
  - use `apps/desktop/resources/sample-ontologies/jsonld-roundtrip.ttl`

## Proposed Test Cases

1. Format Registry
- `getAdapterForExtension('.jsonld')` returns adapter with JSON-LD MIME type.
- `getAdapterForFilePath('/x/ontology.jsonld')` resolves JSON-LD adapter.

2. Status Bar Badge
- With `filePath='/x/ontology.jsonld'`, `StatusBar` shows `JSON-LD`.

3. Store Parse Path
- `loadFromFile(jsonldText, 'ontology.jsonld')` populates classes, properties, individuals.
- Parse errors return warning entries and do not crash.

4. Store Serialize Path
- `serializeForFilePath('ontology.jsonld')` returns JSON-LD string (not Turtle/RDF-XML).

5. Round-Trip Semantic Fidelity
- Start from `jsonld-roundtrip.ttl`.
- Parse TTL to ontology.
- Serialize ontology to JSON-LD.
- Parse JSON-LD back to ontology.
- Assert equivalence of:
  - classes URIs, labels, subclass/disjoint relations
  - object/datatype properties, domain/range, inverse
  - individuals, type assertions, object/data assertions
  - ontology metadata (IRI, versionIRI, imports, annotations where supported)

## Notes on Determinism

- JSON-LD may differ in key ordering/compaction shape while preserving semantics.
- Assertions should compare normalized ontology data structures, not raw JSON string equality.

## CTO Implementation Checklist

- Add dependency `jsonld`.
- Implement adapter:
  - parse: JSON-LD `toRDF()` -> N-Quads -> quads -> `walkQuads()`
  - serialize: ontology -> quads -> `fromRDF()` + `compact()`
- Wire adapter into format registry.
- Update Electron open/save filters to include `.jsonld`.
- Update status bar badge mapping for JSON-LD.
- Add/extend tests above.
