/**
 * System prompt builder — pure.
 *
 * Given the current IR and the stdlib registry, assembles the system
 * prompt handed to Claude on every chat turn. The output is deterministic:
 * same inputs → same bytes, with stdlib entries sorted by
 * `namespace.name` so reordering in the registry doesn't churn the
 * cache key. No I/O, no date stamps, no model references.
 *
 * Contents, in order:
 *   1. Static role/mission header.
 *   2. Op vocabulary — every op name with a one-line shape summary.
 *   3. Stdlib enumeration — `namespace.Name — description`, alphabetised.
 *   4. The full current IR as pretty-printed JSON (Claude parses it
 *      directly; no digest guard in v1, see `plans/pivot.md`).
 *
 * The 100 KB digest guard is deferred to v2: for v1 we always send the
 * full IR. Large-IR handling will slot in here as an input-size check
 * plus an alternative assembly path.
 */

import type { Schema } from '../model/types';

export interface StdlibEntry {
  /** Namespace path, e.g. `'common'` or `'place'`. */
  namespace: string;
  /** Type name, e.g. `'Email'`. */
  name: string;
  /** One-line human description surfaced in the prompt. */
  description: string;
}

export interface StdlibRegistry {
  entries: StdlibEntry[];
}

export interface BuildSystemPromptInput {
  ir: Schema;
  stdlibRegistry: StdlibRegistry;
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  return [
    HEADER.trim(),
    '',
    '## Op vocabulary',
    '',
    renderOpCatalogue(),
    '',
    '## Stdlib types',
    '',
    renderStdlib(input.stdlibRegistry),
    '',
    '## Current IR',
    '',
    '```json',
    JSON.stringify(input.ir, null, 2),
    '```',
    '',
  ].join('\n');
}

const HEADER = `
You are Contexture, an AI assistant that edits a Zod schema for the user.
The user's schema is modelled as an intermediate representation (IR) of
\`TypeDef\`s (object, enum, discriminatedUnion, raw) and fields. You edit
the schema exclusively through the op vocabulary listed below; every op
you call is applied to the IR and its effect is visible on the canvas.
Prefer surgical ops over \`replace_schema\` — the bulk rewrite is an
escape hatch, not a default.
`;

interface OpSpec {
  name: string;
  shape: string;
}

const OP_CATALOGUE: OpSpec[] = [
  { name: 'add_type', shape: '{ type: TypeDef }' },
  { name: 'update_type', shape: "{ name: string; patch: Partial<Omit<TypeDef, 'kind'|'name'>> }" },
  { name: 'rename_type', shape: '{ from: string; to: string }' },
  { name: 'delete_type', shape: '{ name: string }' },
  { name: 'add_field', shape: '{ typeName: string; field: FieldDef; index?: number }' },
  {
    name: 'update_field',
    shape: '{ typeName: string; fieldName: string; patch: Partial<FieldDef> }',
  },
  { name: 'delete_field', shape: '{ typeName: string; fieldName: string }' },
  { name: 'reorder_fields', shape: '{ typeName: string; order: string[] }' },
  { name: 'add_variant', shape: '{ typeName: string; variant: string }' },
  { name: 'set_discriminator', shape: '{ typeName: string; discriminator: string }' },
  { name: 'add_import', shape: '{ import: ImportDecl }' },
  { name: 'remove_import', shape: '{ alias: string }' },
  { name: 'replace_schema', shape: '{ schema: Schema }   # escape hatch; full IR' },
];

function renderOpCatalogue(): string {
  return OP_CATALOGUE.map((op) => `- \`${op.name}\` ${op.shape}`).join('\n');
}

function renderStdlib(registry: StdlibRegistry): string {
  if (registry.entries.length === 0) return '_(none registered)_';
  const sorted = [...registry.entries].sort((a, b) => {
    const ak = `${a.namespace}.${a.name}`;
    const bk = `${b.namespace}.${b.name}`;
    return ak.localeCompare(bk);
  });
  return sorted.map((e) => `- \`${e.namespace}.${e.name}\` — ${e.description}`).join('\n');
}
