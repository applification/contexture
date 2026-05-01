/**
 * Pure helpers for the `reconcile:query` IPC handler.
 *
 * Extracted to a separate module so they can be unit-tested without
 * wiring up Electron's ipcMain or the Agent SDK.
 */

/** Dedicated model for reconcile queries — Haiku is fast enough for structured JSON extraction. */
export const RECONCILE_MODEL = 'claude-haiku-4-5-20251001' as const;

/**
 * Target-kind descriptions used in the reconcile system prompt.
 * Lightly tuned per target so the model understands the output format.
 */
const TARGET_KIND_DESCRIPTIONS: Record<string, string> = {
  convex:
    'a hand-edited `convex/schema.ts` file (Convex database schema). ' +
    'Focus on `defineTable`, `v.*` validators, and Convex index definitions.',
  zod:
    'a hand-edited `.schema.ts` file (Zod schema mirror). ' +
    'Focus on `z.object`, `z.enum`, `z.discriminatedUnion`, and inferred TypeScript types.',
  'json-schema':
    'a hand-edited `.schema.json` file (JSON Schema). ' +
    'Focus on `$defs`, `properties`, `required`, `type`, and `enum` arrays.',
  'schema-index':
    'a hand-edited `index.ts` schema-index file that re-exports named Zod schemas. ' +
    'Focus on the set of exported names and their re-export paths.',
};

export function buildReconcileSystemPrompt(targetKind: string): string {
  const kindDesc =
    TARGET_KIND_DESCRIPTIONS[targetKind] ??
    'a hand-edited generated file that has diverged from what Contexture would emit.';

  return `You are a schema reconciliation assistant for Contexture.

The user has a Contexture IR (a JSON description of a schema) and ${kindDesc}
Your job is to return a JSON array of ops that, when applied to the IR, would make
Contexture emit an output as close as possible to the hand-edited file.

## Op vocabulary

- \`add_type\` { type: TypeDef }
- \`update_type\` { name: string; patch: Partial<Omit<TypeDef, 'kind'|'name'>> }
- \`rename_type\` { from: string; to: string }
- \`delete_type\` { name: string }
- \`add_field\` { typeName: string; field: FieldDef; index?: number }
- \`update_field\` { typeName: string; fieldName: string; patch: Partial<FieldDef> }
- \`remove_field\` { typeName: string; fieldName: string }
- \`reorder_fields\` { typeName: string; order: string[] }
- \`add_value\` { typeName: string; value: string; description?: string }
- \`update_value\` { typeName: string; value: string; patch: { value?: string; description?: string } }
- \`remove_value\` { typeName: string; value: string }
- \`add_variant\` { typeName: string; variant: string }
- \`set_discriminator\` { typeName: string; discriminator: string }
- \`add_import\` { import: ImportDecl }
- \`remove_import\` { alias: string }
- \`set_table_flag\` { typeName: string; table: boolean }
- \`add_index\` { typeName: string; index: { name: string; fields: string[] } }
- \`remove_index\` { typeName: string; name: string }
- \`update_index\` { typeName: string; name: string; patch: Partial<{ name: string; fields: string[] }> }
- \`replace_schema\` { schema: Schema }   # escape hatch; full IR

## FieldDef

\`{ name: string; type: FieldType; optional?: boolean; nullable?: boolean; description?: string }\`

## FieldType

\`{ kind: 'string' | 'number' | 'boolean' | 'date' }\` (with optional constraints),
\`{ kind: 'literal'; value: string|number|boolean }\`,
\`{ kind: 'ref'; typeName: string }\`,
\`{ kind: 'array'; element: FieldType; min?: number; max?: number }\`.

## Output format

Return ONLY a JSON array — no prose, no markdown, no code fences.
Each element of the array MUST have this shape:

\`\`\`
{
  "op": <one of the ops above, as JSON with its \`kind\` field>,
  "label": "<human-readable one-line description>",
  "lossy": <true if the op may destroy data, false otherwise>
}
\`\`\`

Mark \`lossy: true\` for:
- Deleting a type or field
- Renaming a field or type (data in the old column is lost unless migrated)
- Changing a field's type to an incompatible type

If no ops are needed (the IR already produces the hand-edited file), return \`[]\`.

The current IR and the hand-edited file are in the user message.`;
}

export function buildReconcileUserTurn(
  irJson: string,
  onDiskSource: string,
  targetKind: string,
): string {
  return [
    '<current_ir>',
    irJson,
    '</current_ir>',
    '',
    `<on_disk_source kind="${targetKind}">`,
    onDiskSource,
    '</on_disk_source>',
    '',
    'Return the reconcile ops JSON array.',
  ].join('\n');
}

/**
 * Pull the JSON ops array out of an assistant response. The model is
 * instructed to return only the array, but a stray code fence or
 * leading sentence shouldn't fail the whole reconcile — scan forward
 * through every `[` position until we find a slice that parses as an
 * array. This handles prose that contains `[…]` spans before the
 * actual payload.
 */
export function extractOpsArray(
  text: string,
): { ok: true; ops: unknown[] } | { ok: false; error: string } {
  const end = text.lastIndexOf(']');
  let start = text.indexOf('[');
  let lastError = 'No JSON array found in response.';

  while (start !== -1 && start <= end) {
    const slice = text.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed)) return { ok: true, ops: parsed };
      lastError = 'Response did not parse as a JSON array.';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = `Failed to parse ops JSON: ${message}`;
    }
    start = text.indexOf('[', start + 1);
  }

  return { ok: false, error: lastError };
}
