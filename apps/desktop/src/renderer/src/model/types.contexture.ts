// Target type contract for the Contexture pivot (Phase 0).
//
// This file is NOT yet wired up. It lives alongside `types.ts` until Phase 2,
// at which point it replaces `types.ts` entirely. The OWL-shaped `Ontology`
// and its satellite types are deleted in Phase 2a.
//
// Scope per plan:
//   - Single-file JSON-LD mode only (no ContextBundle, no multi-file project mode).
//   - Core in-memory shape = a parsed JSON-LD document + a derived Frame[] view.
//   - Frames are projected from the document by grouping `@type` declarations.
//   - No Kosmos coupling; types live locally in Contexture.
//
// See: Contexture Pivot plan (/Users/davehudson/.claude/plans/...)

// ---------- JSON-LD primitives ----------

/** A parsed `@context` object. Keys map short names to IRIs or term definitions. */
export type JsonLdContext = Record<string, JsonLdTermDefinition>;

/** A single `@context` entry. Either a plain IRI string or an expanded term definition. */
export type JsonLdTermDefinition =
  | string
  | {
      '@id'?: string;
      '@type'?: string;
      '@container'?: '@list' | '@set' | '@index' | '@language' | '@id' | '@type';
      '@language'?: string;
      '@reverse'?: string;
      [key: string]: unknown;
    };

/**
 * The parsed JSON-LD document loaded from disk.
 *
 * `raw` holds the original parsed JSON object so round-trip saves preserve
 * field order and any keys Contexture doesn't understand. `context` is the
 * extracted `@context` (either inline or the merged result after resolving
 * an external context reference). `nodes` is the set of top-level `@id`-bearing
 * objects plus any embedded objects reachable through predicates.
 */
export interface JsonLdDocument {
  raw: unknown;
  context: JsonLdContext;
  nodes: JsonLdNode[];
}

/** A single `@id`-bearing object inside a JSON-LD document. */
export interface JsonLdNode {
  id?: string; // expanded `@id` IRI (blank-node id if none)
  types: string[]; // expanded `@type` IRIs
  properties: Record<string, JsonLdValue[]>; // predicate IRI -> values
}

export type JsonLdValue =
  | { kind: 'literal'; value: string; datatype?: string; language?: string }
  | { kind: 'ref'; id: string } // reference to another node by `@id`
  | { kind: 'embedded'; node: JsonLdNode }; // inline object without a shared `@id`

// ---------- Frame view-model ----------
//
// A Frame is NOT persisted directly — it is a view projection over the loaded
// JsonLdDocument. The renderer canvas, detail panel, and validation all consume
// Frame[]. Edits to a Frame/FrameField flow back into the JsonLdDocument via
// store mutators, which re-derive Frame[] on change.

/**
 * A Frame describes the shape of a single `@type` group in the loaded document:
 * its type IRI, its expected fields (predicates), and optional metadata for
 * the extraction-preview / embed-template workflow.
 */
export interface Frame {
  typeIri: string; // expanded `@type` IRI
  fields: FrameField[];
  description?: string;
  /** Mustache-style template rendering an instance of this frame to text for LLM prompts. */
  embedTemplate?: string;
}

export interface FrameField {
  name: string;
  predicateIri: string; // expanded predicate IRI
  kind: 'literal' | 'ref' | 'embedded-frame';
  /** Target type IRI (for `ref` / `embedded-frame`) or XSD datatype (for `literal`). */
  range?: string;
  optional: boolean;
  multiple: boolean;
}

// ---------- Projection config (kept from pivot doc, unused in single-file v1 but cheap to carry) ----------

export interface ProjectionConfig {
  predicateDenylist: string[];
  embedTemplates?: Record<string, string>;
}

// ---------- Factories ----------

export function createEmptyJsonLdDocument(): JsonLdDocument {
  return {
    raw: { '@context': {} },
    context: {},
    nodes: [],
  };
}

export function createEmptyProjectionConfig(): ProjectionConfig {
  return { predicateDenylist: [] };
}
