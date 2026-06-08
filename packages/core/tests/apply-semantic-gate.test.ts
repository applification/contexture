import { describe, expect, it } from 'vitest';
import { getEvolutionPolicy } from '../src/evolution-policy';
import type { Schema } from '../src/ir';
import { IRSchema } from '../src/ir';
import { apply, type Op, OpSchema } from '../src/ops';
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
  it('defaults evolutionPolicy to preserveData and applies set_evolution_policy', () => {
    expect(getEvolutionPolicy(baseSchema)).toBe('preserveData');
    expect(
      IRSchema.safeParse({ version: '1', metadata: { evolutionPolicy: 'scratch' }, types: [] }),
    ).toMatchObject({ success: true });

    const result = apply(baseSchema, { kind: 'set_evolution_policy', policy: 'scratch' });

    expect(result).toMatchObject({
      schema: { metadata: { evolutionPolicy: 'scratch' } },
    });
  });

  it('rejects invalid evolutionPolicy values', () => {
    const parsed = OpSchema.safeParse({
      kind: 'set_evolution_policy',
      policy: 'reckless',
    });

    expect(parsed.success).toBe(false);
    expect(
      IRSchema.safeParse({ version: '1', metadata: { evolutionPolicy: 'reckless' }, types: [] }),
    ).toMatchObject({ success: false });
  });

  it('rejects update_type patches that try to change identity through the wrong op', () => {
    const parsed = OpSchema.safeParse({
      kind: 'update_type',
      name: 'Order',
      patch: { name: 'Invoice' },
    });
    expect(parsed.success).toBe(false);

    const result = apply(baseSchema, {
      kind: 'update_type',
      name: 'Order',
      patch: { kind: 'raw' },
    } as unknown as Op);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('update_type');
      expect(result.error).toContain('replace_schema');
    }
  });

  it('returns an error instead of throwing when an update_type patch breaks IR structure', () => {
    const result = apply(baseSchema, {
      kind: 'update_type',
      name: 'Order',
      patch: { fields: 'not an array' },
    } as unknown as Op);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('update_type');
      expect(result.error).toContain('invalid Contexture IR');
      expect(result.error).toContain('types.0.fields');
    }
  });

  it('returns an error instead of throwing when malformed op payloads hit reducer helpers', () => {
    const result = apply(baseSchema, {
      kind: 'add_index',
      typeName: 'Order',
      index: { name: 'by_missing_shape' },
    } as unknown as Op);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('add_index');
    }
  });

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

  it('accepts ops that introduce only semantic warnings', () => {
    const start: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Household', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [{ name: 'householdId', type: { kind: 'ref', typeName: 'Household' } }],
        },
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [{ name: 'householdId', type: { kind: 'ref', typeName: 'Household' } }],
        },
      ],
    };
    const op: Op = {
      kind: 'add_field',
      typeName: 'MealPlanMeal',
      field: { name: 'recipeId', type: { kind: 'ref', typeName: 'Recipe' } },
    };

    expect(apply(start, op, STDLIB)).toMatchObject({ schema: expect.any(Object) });
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

  it('without a catalog, still rejects unresolved local refs', () => {
    const op: Op = {
      kind: 'add_field',
      typeName: 'Order',
      field: { name: 'country', type: { kind: 'ref', typeName: 'CountryCode' } },
    };
    const result = apply(baseSchema, op);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Unresolved ref "CountryCode"');
      expect(result.error).not.toContain('Did you mean');
    }
  });

  it('without a catalog, accepts qualified refs when the alias is imported', () => {
    const start: Schema = {
      ...baseSchema,
      imports: [{ kind: 'stdlib', path: '@contexture/place', alias: 'place' }],
    };
    const op: Op = {
      kind: 'add_field',
      typeName: 'Order',
      field: { name: 'country', type: { kind: 'ref', typeName: 'place.CountryCode' } },
    };
    const result = apply(start, op);
    expect('schema' in result).toBe(true);
  });
});
