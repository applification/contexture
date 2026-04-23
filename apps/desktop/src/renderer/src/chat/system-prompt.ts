/**
 * System prompt builder — pure.
 *
 * Emits the *append* body handed to the Agent SDK on every chat turn
 * via `{ type: 'preset', preset: 'claude_code', append }`. Using the
 * preset keeps the SDK's default framing intact so plugin-loaded skills
 * (`model-domain`, `use-stdlib`, `generate-sample`) auto-trigger on
 * description match. A raw-string systemPrompt would replace that
 * framing and silently disable skill loading.
 *
 * Contents, in order:
 *   1. Imperative role/mission header — push tool use; forbid prose
 *      schemas; name the available skills.
 *   2. Op vocabulary — every op name with a one-line shape summary.
 *   3. Stdlib enumeration — `namespace.Name — description`, alphabetised.
 *
 * The current IR is NOT in the system prompt: it's injected into each
 * user message via `buildUserMessage` so that `resume`-based sessions
 * (which re-use the original system prompt) still see the latest
 * schema. Same inputs → same bytes, with stdlib entries sorted so
 * registry reordering doesn't churn the cache key.
 */

import type { Schema } from '../model/ir';

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

export interface BuildSystemPromptAppendInput {
  stdlibRegistry: StdlibRegistry;
}

export function buildSystemPromptAppend(input: BuildSystemPromptAppendInput): string {
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
  ].join('\n');
}

export interface BuildUserMessageInput {
  ir: Schema;
  userMessage: string;
}

/**
 * Wraps the user's message with a `<current_ir>` block carrying the
 * latest IR snapshot. Called per turn so that even when `resume` is
 * used (and the SDK replays the original system prompt) Claude always
 * sees the current schema.
 */
export function buildUserMessage(input: BuildUserMessageInput): string {
  return [
    '<current_ir>',
    JSON.stringify(input.ir, null, 2),
    '</current_ir>',
    '',
    input.userMessage,
  ].join('\n');
}

const HEADER = `
You are Contexture, an AI assistant that edits a Zod schema IR for the
user. The schema is modelled as \`TypeDef\`s (object, enum,
discriminatedUnion, raw) and fields, shown live on a canvas.

**You edit the schema exclusively by calling the op tools listed
below.** When the user asks for a schema, type, field, enum, union, or
any change — call tools. Do **not** respond with TypeScript or Zod
code in prose: the user will not see it applied, and the canvas will
not update. If no tool fits, say so briefly and ask for clarification;
never fake the edit with text.

The current IR is supplied at the top of each user message inside a
\`<current_ir>\` block — parse it directly to understand the existing
schema before proposing edits. Prefer surgical ops over
\`replace_schema\`; the bulk rewrite is an escape hatch, not a default.

Skills are available and auto-load on topic match:
- \`model-domain\` — use when the user asks to model a new domain from
  scratch. Walks entities, relationships, enums, constraints, stdlib.
- \`use-stdlib\` — use when a field could reuse a curated stdlib type
  (Email, URL, UUID, Address, Money, PhoneE164, …).
- \`generate-sample\` — use when the user asks for sample / fixture /
  example data for a type.
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
