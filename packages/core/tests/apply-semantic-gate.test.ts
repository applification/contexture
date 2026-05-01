import { describe, expect, it } from 'vitest';
import type { Schema } from '../src/ir';
import { apply, type Op } from '../src/ops';
import type { StdlibCatalog } from '../src/semantic-validation';

const STDLIB: StdlibCatalog = {
  namespaces: ['common', 'place', 'money'],
  hasType: (ns, name) => {
    const types: Record<string, ReadonlySet<string>> = {
      common: new Set(['Email', 'URL']),
      place: new Set(['CountryCode']),
      money: new Set(['Money']),
    };
    return types[ns]?.has(name) ?? false;
  },
};

const baseSchema: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Order', fields: [] }],
};

describe('apply() — delta semantic gate', () => {
  it('rejects add_field with a bare ref that matches a stdlib type', () => {
    const op: Op = {
      kind: 'add_field',
      typeName: 'Order',
      field: { name: 'country', type: { kind: 'ref', typeName: 'CountryCode' } },
    };
    const result = apply(baseSchema, op, STDLIB);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Unresolved ref "CountryCode"');
      expect(result.error).toContain('Did you mean "place.CountryCode"?');
    }
  });

  it('accepts add_field with a qualified stdlib ref (catalog-resolved, no add_import)', () => {
    const op: Op = {
      kind: 'add_field',
      typeName: 'Order',
      field: { name: 'country', type: { kind: 'ref', typeName: 'place.CountryCode' } },
    };
    const result = apply(baseSchema, op, STDLIB);
    expect('schema' in result).toBe(true);
  });

  it('accepts update_field that rewrites a ref to a primitive (not a new issue)', () => {
    const start: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Order',
          fields: [{ name: 'c', type: { kind: 'ref', typeName: 'place.CountryCode' } }],
        },
      ],
    };
    const op: Op = {
      kind: 'update_field',
      typeName: 'Order',
      fieldName: 'c',
      patch: { type: { kind: 'string' } },
    };
    const result = apply(start, op, STDLIB);
    expect('schema' in result).toBe(true);
  });

  it('rejects add_import for an unknown stdlib namespace', () => {
    const op: Op = {
      kind: 'add_import',
      import: { kind: 'stdlib', path: '@contexture/banana', alias: 'banana' },
    };
    const result = apply(baseSchema, op, STDLIB);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('@contexture/banana');
      expect(result.error).toContain('Available');
    }
  });

  it('rejects add_import where alias does not match the stdlib namespace', () => {
    const op: Op = {
      kind: 'add_import',
      import: { kind: 'stdlib', path: '@contexture/place', alias: 'p' },
    };
    const result = apply(baseSchema, op, STDLIB);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('alias');
    }
  });

  it('rejects replace_schema that introduces multiple unresolved refs', () => {
    const op: Op = {
      kind: 'replace_schema',
      schema: {
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Order',
            fields: [
              { name: 'c', type: { kind: 'ref', typeName: 'CountryCode' } },
              { name: 'p', type: { kind: 'ref', typeName: 'Money' } },
            ],
          },
        ],
      },
    };
    const result = apply(baseSchema, op, STDLIB);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Unresolved ref "CountryCode"');
      expect(result.error).toContain('Unresolved ref "Money"');
      expect(result.error).toContain('Did you mean "place.CountryCode"?');
      expect(result.error).toContain('Did you mean "money.Money"?');
    }
  });

  it('does not blame an op for pre-existing issues', () => {
    const broken: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Order',
          fields: [
            { name: 'c', type: { kind: 'ref', typeName: 'CountryCode' } },
            { name: 'p', type: { kind: 'ref', typeName: 'Money' } },
          ],
        },
      ],
    };
    // Removing an unrelated field should succeed even though refs are still broken.
    const op: Op = { kind: 'remove_field', typeName: 'Order', fieldName: 'p' };
    const result = apply(broken, op, STDLIB);
    expect('schema' in result).toBe(true);
  });

  it('without a catalog, behaves structurally (today’s behaviour)', () => {
    const op: Op = {
      kind: 'add_field',
      typeName: 'Order',
      field: { name: 'country', type: { kind: 'ref', typeName: 'CountryCode' } },
    };
    const result = apply(baseSchema, op);
    expect('schema' in result).toBe(true);
  });
});
