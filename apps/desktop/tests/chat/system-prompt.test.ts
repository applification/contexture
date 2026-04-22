import { buildSystemPrompt, type StdlibRegistry } from '@renderer/chat/system-prompt';
import type { Schema } from '@renderer/model/types';
import { describe, expect, it } from 'vitest';

const EMPTY_IR: Schema = { version: '1', types: [] };
const EMPTY_STDLIB: StdlibRegistry = { entries: [] };

describe('buildSystemPrompt', () => {
  it('includes the static role/mission header', () => {
    const prompt = buildSystemPrompt({ ir: EMPTY_IR, stdlibRegistry: EMPTY_STDLIB });
    expect(prompt).toMatch(/Contexture/);
    expect(prompt).toMatch(/schema/i);
  });

  it('enumerates every op in the vocabulary with its shape', () => {
    const prompt = buildSystemPrompt({ ir: EMPTY_IR, stdlibRegistry: EMPTY_STDLIB });
    for (const op of [
      'add_type',
      'update_type',
      'rename_type',
      'delete_type',
      'add_field',
      'update_field',
      'delete_field',
      'reorder_fields',
      'add_variant',
      'set_discriminator',
      'add_import',
      'remove_import',
      'replace_schema',
    ]) {
      expect(prompt).toContain(op);
    }
  });

  it('enumerates stdlib types as "namespace.Name" with their description', () => {
    const stdlib: StdlibRegistry = {
      entries: [
        { namespace: 'common', name: 'Email', description: 'RFC 5322 email address' },
        { namespace: 'money', name: 'Money', description: 'Currency + minor-units amount' },
      ],
    };
    const prompt = buildSystemPrompt({ ir: EMPTY_IR, stdlibRegistry: stdlib });
    expect(prompt).toContain('common.Email');
    expect(prompt).toContain('RFC 5322 email address');
    expect(prompt).toContain('money.Money');
    expect(prompt).toContain('Currency + minor-units amount');
  });

  it('embeds the full current IR as JSON', () => {
    const ir: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Plot', fields: [] }],
    };
    const prompt = buildSystemPrompt({ ir, stdlibRegistry: EMPTY_STDLIB });
    // The full IR JSON must appear verbatim — Claude parses this directly.
    expect(prompt).toContain(JSON.stringify(ir, null, 2));
  });

  it('is deterministic across stdlib-entry orderings', () => {
    const a: StdlibRegistry = {
      entries: [
        { namespace: 'common', name: 'Email', description: 'Email' },
        { namespace: 'money', name: 'Money', description: 'Money' },
        { namespace: 'common', name: 'URL', description: 'URL' },
      ],
    };
    const b: StdlibRegistry = {
      entries: [
        { namespace: 'money', name: 'Money', description: 'Money' },
        { namespace: 'common', name: 'URL', description: 'URL' },
        { namespace: 'common', name: 'Email', description: 'Email' },
      ],
    };
    expect(buildSystemPrompt({ ir: EMPTY_IR, stdlibRegistry: a })).toBe(
      buildSystemPrompt({ ir: EMPTY_IR, stdlibRegistry: b }),
    );
  });

  it('is byte-identical when called twice with the same input', () => {
    const ir: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Plot', fields: [] },
        { kind: 'enum', name: 'Season', values: [{ value: 'spring' }, { value: 'summer' }] },
      ],
    };
    const stdlib: StdlibRegistry = {
      entries: [{ namespace: 'common', name: 'Email', description: 'Email' }],
    };
    const once = buildSystemPrompt({ ir, stdlibRegistry: stdlib });
    const twice = buildSystemPrompt({ ir, stdlibRegistry: stdlib });
    expect(once).toBe(twice);
  });

  it('matches a stable snapshot for a representative schema', () => {
    const ir: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Plot',
          fields: [
            { name: 'id', type: { kind: 'string', format: 'uuid' } },
            { name: 'area', type: { kind: 'number', min: 0 }, optional: true },
          ],
        },
        {
          kind: 'enum',
          name: 'Season',
          values: [
            { value: 'spring' },
            { value: 'summer' },
            { value: 'autumn' },
            { value: 'winter' },
          ],
        },
      ],
    };
    const stdlib: StdlibRegistry = {
      entries: [
        { namespace: 'common', name: 'Email', description: 'RFC 5322 email address' },
        { namespace: 'common', name: 'URL', description: 'WHATWG URL' },
        { namespace: 'money', name: 'Money', description: 'Currency + minor units' },
      ],
    };
    expect(buildSystemPrompt({ ir, stdlibRegistry: stdlib })).toMatchSnapshot();
  });
});
