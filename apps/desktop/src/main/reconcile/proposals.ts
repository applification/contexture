import type { Schema } from '@renderer/model/ir';
import type { ModelOptions, ProviderRuntime } from '../providers/runtime';

export interface ReconcileProposalInput {
  irJson: string;
  onDiskSource: string;
  targetKind: string;
}

export type ReconcileProposalResult = { ok: true; ops: unknown[] } | { ok: false; error: string };

export interface GenerateReconcileProposalOptions {
  runtime: ProviderRuntime;
  schema: Schema;
  modelOptions?: { model?: string; effort?: string; options?: ModelOptions };
  payload: ReconcileProposalInput;
}

export async function generateReconcileProposal(
  options: GenerateReconcileProposalOptions,
): Promise<ReconcileProposalResult> {
  const status = await options.runtime.getStatus();
  if (!isReadyForGeneration(status.readiness)) {
    return {
      ok: false,
      error: `${providerLabel(options.runtime.provider)} is unavailable for reconcile proposals: ${status.detail ?? status.readiness}.`,
    };
  }

  try {
    const text = await options.runtime.generateText({
      systemPrompt: buildReconcileSystemPrompt(options.payload.targetKind),
      message: buildReconcileUserTurn(
        options.payload.irJson,
        options.payload.onDiskSource,
        options.payload.targetKind,
      ),
      schema: options.schema,
      ...(options.modelOptions ?? {}),
    });
    return extractOpsArray(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function isReadyForGeneration(readiness: string): boolean {
  return (
    readiness === 'authenticated_cli' ||
    readiness === 'authenticated_chatgpt' ||
    readiness === 'authenticated_api_key'
  );
}

function providerLabel(provider: string): string {
  return provider === 'codex' ? 'Codex' : provider === 'claude' ? 'Claude' : provider;
}

/**
 * Target-kind descriptions used in the reconcile system prompt.
 * These are lightly tuned per target so the model understands the
 * output format it is reconciling against.
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

/**
 * Build the reconcile system prompt. The op-vocabulary list is
 * duplicated from the renderer prompt because this runs in the main
 * process and needs a narrow, provider-neutral import surface.
 */
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

Return ONLY a JSON array - no prose, no markdown, no code fences.
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
 * leading sentence should not fail the whole reconcile.
 */
export function extractOpsArray(
  text: string,
): { ok: true; ops: unknown[] } | { ok: false; error: string } {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, error: 'No JSON array found in response.' };
  }
  const slice = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to parse ops JSON: ${message}` };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Response did not parse as a JSON array.' };
  }
  return { ok: true, ops: parsed };
}
