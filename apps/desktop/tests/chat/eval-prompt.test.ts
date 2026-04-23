/**
 * Eval prompt builder — deterministic string given IR + root + mode.
 */
import { buildEvalPrompt, evalRootCandidates } from '@renderer/chat/eval-prompt';
import type { Schema } from '@renderer/model/ir';
import { describe, expect, it } from 'vitest';

const ir: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Plot',
      fields: [{ name: 'name', type: { kind: 'string' } }],
    },
    {
      kind: 'raw',
      name: 'ExternalThing',
      zod: 'z.unknown()',
      jsonSchema: {},
      import: { from: '../other', name: 'ExternalThing' },
    },
  ],
};

describe('buildEvalPrompt', () => {
  it('embeds the root type name, mode, blurb, and JSON schema', () => {
    const out = buildEvalPrompt({
      ir,
      rootTypeName: 'Plot',
      rootJsonSchema: { type: 'object', required: ['name'] },
      mode: 'realistic',
    });
    expect(out).toContain('Root type: **Plot**');
    expect(out).toContain('Mode: **realistic**');
    expect(out).toContain('emit_sample');
    expect(out).toContain('"required": [');
  });

  it('injects grounding text when provided', () => {
    const out = buildEvalPrompt({
      ir,
      rootTypeName: 'Plot',
      rootJsonSchema: {},
      mode: 'minimal',
      grounding: 'Prefer names from Welsh folklore.',
    });
    expect(out).toContain('## Grounding');
    expect(out).toContain('Welsh folklore');
  });

  it('is deterministic', () => {
    const a = buildEvalPrompt({ ir, rootTypeName: 'Plot', rootJsonSchema: {}, mode: 'minimal' });
    const b = buildEvalPrompt({ ir, rootTypeName: 'Plot', rootJsonSchema: {}, mode: 'minimal' });
    expect(a).toBe(b);
  });
});

describe('evalRootCandidates', () => {
  it('excludes raw TypeDefs that are imported externally', () => {
    expect(evalRootCandidates(ir)).toEqual(['Plot']);
  });

  it('returns every local TypeDef name when none are imports', () => {
    const local: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'A', fields: [] },
        { kind: 'enum', name: 'B', values: [{ value: 'x' }] },
      ],
    };
    expect(evalRootCandidates(local)).toEqual(['A', 'B']);
  });
});
