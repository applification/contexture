import { describe, expect, it } from 'vitest';
import type { Schema } from '../src/ir';
import { checkSemantic, type StdlibCatalog } from '../src/semantic-validation';

const STDLIB: StdlibCatalog = {
  namespaces: ['common', 'place', 'money'],
  hasType: (ns, name) => {
    const types: Record<string, ReadonlySet<string>> = {
      common: new Set(['Email', 'URL']),
      place: new Set(['CountryCode', 'Address']),
      money: new Set(['Money', 'CurrencyCode']),
    };
    return types[ns]?.has(name) ?? false;
  },
};

const objectWithRef = (typeName: string): Schema => ({
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Order',
      fields: [{ name: 'country', type: { kind: 'ref', typeName } }],
    },
  ],
});

describe('checkSemantic — refs', () => {
  it('passes for a local ref', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Buyer', fields: [] },
        {
          kind: 'object',
          name: 'Order',
          fields: [{ name: 'buyer', type: { kind: 'ref', typeName: 'Buyer' } }],
        },
      ],
    };
    expect(checkSemantic(schema, STDLIB)).toEqual([]);
  });

  it('passes for a qualified stdlib ref with no add_import (catalog-resolved)', () => {
    expect(checkSemantic(objectWithRef('place.CountryCode'), STDLIB)).toEqual([]);
  });

  it('rejects a bare ref that matches a stdlib type, with a hint', () => {
    const issues = checkSemantic(objectWithRef('CountryCode'), STDLIB);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('unresolved_ref');
    expect(issues[0]?.path).toBe('types.0.fields.0.type');
    expect(issues[0]?.hint).toBe('Did you mean "place.CountryCode"?');
  });

  it('rejects a bare ref with no stdlib match, no hint', () => {
    const issues = checkSemantic(objectWithRef('TotallyUnknown'), STDLIB);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.hint).toBeUndefined();
  });

  it('rejects a qualified ref to an unknown namespace', () => {
    const issues = checkSemantic(objectWithRef('banana.CountryCode'), STDLIB);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('unresolved_ref');
  });

  it('reports multiple offenders in path order', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'A',
          fields: [
            { name: 'x', type: { kind: 'ref', typeName: 'CountryCode' } },
            { name: 'y', type: { kind: 'ref', typeName: 'Money' } },
          ],
        },
      ],
    };
    const issues = checkSemantic(schema, STDLIB);
    expect(issues.map((i) => i.hint)).toEqual([
      'Did you mean "place.CountryCode"?',
      'Did you mean "money.Money"?',
    ]);
  });

  it('walks into array element refs', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'A',
          fields: [
            {
              name: 'tags',
              type: {
                kind: 'array',
                element: { kind: 'ref', typeName: 'CountryCode' },
              },
            },
          ],
        },
      ],
    };
    const issues = checkSemantic(schema, STDLIB);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('types.0.fields.0.type.element');
  });

  it('without a catalog, treats stdlib namespaces as unknown unless explicitly imported', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/place', alias: 'place' }],
      types: [
        {
          kind: 'object',
          name: 'A',
          fields: [{ name: 'c', type: { kind: 'ref', typeName: 'place.CountryCode' } }],
        },
      ],
    };
    expect(checkSemantic(schema)).toEqual([]);
  });
});

describe('checkSemantic — imports', () => {
  it('rejects an unknown stdlib namespace', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/banana', alias: 'banana' }],
      types: [],
    };
    const issues = checkSemantic(schema, STDLIB);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('unknown_stdlib_namespace');
    expect(issues[0]?.path).toBe('imports.0');
    expect(issues[0]?.message).toContain('@contexture/banana');
    expect(issues[0]?.hint).toContain('@contexture/common');
  });

  it('rejects a stdlib import whose alias does not match its namespace', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/place', alias: 'p' }],
      types: [],
    };
    const issues = checkSemantic(schema, STDLIB);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('stdlib_alias_mismatch');
    expect(issues[0]?.path).toBe('imports.0');
  });

  it('accepts a relative import with any alias', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'relative', path: './shared.contexture.json', alias: 'shared' }],
      types: [],
    };
    expect(checkSemantic(schema, STDLIB)).toEqual([]);
  });

  it('rejects duplicate aliases', () => {
    const schema: Schema = {
      version: '1',
      imports: [
        { kind: 'stdlib', path: '@contexture/place', alias: 'place' },
        { kind: 'stdlib', path: '@contexture/money', alias: 'place' },
      ],
      types: [],
    };
    const issues = checkSemantic(schema, STDLIB);
    expect(issues.some((i) => i.code === 'duplicate_alias')).toBe(true);
  });
});

describe('checkSemantic — duplicates', () => {
  it('rejects duplicate type names', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'A', fields: [] },
        { kind: 'object', name: 'A', fields: [] },
      ],
    };
    const issues = checkSemantic(schema, STDLIB);
    expect(issues.some((i) => i.code === 'duplicate_type_name')).toBe(true);
  });
});
