/**
 * Eval system-prompt builder — pure.
 *
 * The Eval surface is deliberately separated from the schema-design
 * chat: different system prompt, different tool set, different history.
 * This module emits the prompt handed to Claude when the user clicks
 * "Generate" in the Eval panel.
 *
 * Contents, in order:
 *   1. Role / mission header — "you are generating sample data".
 *   2. The selected mode with a short explanation so Claude doesn't need
 *      to re-derive it from the `generate-sample` skill's arg.
 *   3. Hard rules Claude must follow regardless of mode.
 *   4. The root type's JSON Schema, pretty-printed. Claude uses this as
 *      the parse contract and as the `emit_sample` tool's input schema.
 */

import type { Schema } from '../model/ir';

export type EvalMode = 'realistic' | 'minimal' | 'edge-case' | 'adversarial';

export interface BuildEvalPromptInput {
  ir: Schema;
  rootTypeName: string;
  rootJsonSchema: object;
  mode: EvalMode;
  grounding?: string;
}

const MODE_BLURB: Record<EvalMode, string> = {
  realistic:
    'Plausible production data. Diverse names, sensible values, dates within the last year or so.',
  minimal:
    'Smallest valid document. Skip every optional field; shortest/least-constrained valid values.',
  'edge-case':
    'Boundary values. Strings at min/max length, numbers at min/max, Unicode in free-text.',
  adversarial:
    'Inputs that are valid but trip naïve downstream code — SQL-ish strings, RTL, DST boundaries.',
};

const HARD_RULES = [
  'The output must parse under the root Zod schema exactly as given.',
  'Every required field present; every enum value exactly one of the declared choices.',
  'Ref fields point at valid documents for the target type.',
  'Use stdlib formats: emails via z.string().email(), ISODate as YYYY-MM-DD, ISODateTime with timezone offset, E.164 phones starting with +, ISO 3166-1 alpha-2 country codes, ISO 4217 currency codes.',
  'Respond only by invoking the `emit_sample` tool. Do not emit prose — the harness expects one tool call and then a result.',
];

export function buildEvalPrompt({
  ir,
  rootTypeName,
  rootJsonSchema,
  mode,
  grounding,
}: BuildEvalPromptInput): string {
  return [
    'You are generating sample data for a Zod schema in the Contexture editor.',
    '',
    `Root type: **${rootTypeName}**`,
    `Mode: **${mode}** — ${MODE_BLURB[mode]}`,
    '',
    '## Hard rules',
    '',
    ...HARD_RULES.map((r) => `- ${r}`),
    '',
    ...(grounding ? ['## Grounding', '', grounding, ''] : []),
    '## Root JSON Schema',
    '',
    '```json',
    JSON.stringify(rootJsonSchema, null, 2),
    '```',
    '',
    '## Full IR (for cross-references)',
    '',
    '```json',
    JSON.stringify(ir, null, 2),
    '```',
    '',
  ].join('\n');
}

/** Non-imported TypeDefs eligible to pick as the eval root. */
export function evalRootCandidates(ir: Schema): string[] {
  return ir.types.filter((t) => t.kind !== 'raw' || !t.import).map((t) => t.name);
}
