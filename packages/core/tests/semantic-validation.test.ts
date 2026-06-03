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

  it('validates relationship metadata on table refs', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Household',
          table: true,
          fields: [],
        },
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
          fields: [
            { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
            {
              name: 'recipeId',
              type: {
                kind: 'ref',
                typeName: 'Recipe',
                relationship: {
                  onDelete: 'restrict',
                  ownership: { scopeField: 'householdId' },
                },
              },
            },
          ],
        },
      ],
    };

    expect(checkSemantic(schema, STDLIB)).toEqual([]);
  });

  it('rejects relationship metadata that cannot be enforced safely', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Address', fields: [] },
        {
          kind: 'object',
          name: 'Order',
          table: true,
          fields: [
            {
              name: 'addressId',
              type: {
                kind: 'ref',
                typeName: 'Address',
                relationship: { onDelete: 'setNull', ownership: { scopeField: 'householdId' } },
              },
            },
          ],
        },
      ],
    };

    expect(checkSemantic(schema, STDLIB).map((issue) => issue.code)).toEqual([
      'relationship_target_not_table',
      'relationship_set_null_requires_nullable',
      'relationship_cleanup_index_missing',
      'relationship_scope_field_missing',
      'relationship_scope_field_missing',
    ]);
  });

  it('requires cleanup indexes for cascade and setNull delete policies', () => {
    const baseTypes: Schema['types'] = [
      { kind: 'object', name: 'Household', table: true, fields: [] },
      {
        kind: 'object',
        name: 'Recipe',
        table: true,
        fields: [{ name: 'householdId', type: { kind: 'ref', typeName: 'Household' } }],
      },
    ];
    const withoutIndex: Schema = {
      version: '1',
      types: [
        ...baseTypes,
        {
          kind: 'object',
          name: 'Leftover',
          table: true,
          fields: [
            {
              name: 'recipeId',
              type: { kind: 'ref', typeName: 'Recipe', relationship: { onDelete: 'cascade' } },
            },
          ],
        },
      ],
    };
    const withIndex: Schema = {
      version: '1',
      types: [
        ...baseTypes,
        {
          kind: 'object',
          name: 'Leftover',
          table: true,
          fields: [
            {
              name: 'recipeId',
              type: { kind: 'ref', typeName: 'Recipe', relationship: { onDelete: 'cascade' } },
            },
          ],
          indexes: [{ name: 'by_recipe', fields: ['recipeId'] }],
        },
      ],
    };

    expect(checkSemantic(withoutIndex, STDLIB).map((issue) => issue.code)).toContain(
      'relationship_cleanup_index_missing',
    );
    expect(checkSemantic(withIndex, STDLIB).map((issue) => issue.code)).not.toContain(
      'relationship_cleanup_index_missing',
    );
  });

  it('warns when table refs share a tenant ref axis but ownership is missing', () => {
    const schema: Schema = {
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
          fields: [
            { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
            { name: 'recipeId', type: { kind: 'ref', typeName: 'Recipe' } },
          ],
        },
      ],
    };

    const warnings = checkSemantic(schema, STDLIB).filter((issue) => issue.severity === 'warning');
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'relationship_ownership_scope_missing',
        path: 'types.2.fields.1.type.relationship.ownership',
        message: expect.stringContaining('MealPlanMeal.recipeId -> recipe'),
        hint: expect.stringContaining('relationship.crossScope: true'),
      }),
    ]);
  });

  it('does not warn when ownership is explicit or cross-scope is explicit', () => {
    const baseTypes: Schema['types'] = [
      { kind: 'object', name: 'Household', table: true, fields: [] },
      {
        kind: 'object',
        name: 'Recipe',
        table: true,
        fields: [{ name: 'householdId', type: { kind: 'ref', typeName: 'Household' } }],
      },
    ];
    const scoped: Schema = {
      version: '1',
      types: [
        ...baseTypes,
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
            {
              name: 'recipeId',
              type: {
                kind: 'ref',
                typeName: 'Recipe',
                relationship: { ownership: { scopeField: 'householdId' } },
              },
            },
          ],
        },
      ],
    };
    const crossScope: Schema = {
      version: '1',
      types: [
        ...baseTypes,
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
            {
              name: 'recipeId',
              type: {
                kind: 'ref',
                typeName: 'Recipe',
                relationship: { crossScope: true },
              },
            },
          ],
        },
      ],
    };

    for (const schema of [scoped, crossScope]) {
      expect(checkSemantic(schema, STDLIB).map((issue) => issue.code)).not.toContain(
        'relationship_ownership_scope_missing',
      );
    }
  });

  it('does not warn for refs to tenant roots or global tables without a shared axis', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Household', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Ingredient',
          table: true,
          fields: [{ name: 'name', type: { kind: 'string' } }],
        },
        {
          kind: 'object',
          name: 'PantryItem',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
            { name: 'ingredientId', type: { kind: 'ref', typeName: 'Ingredient' } },
          ],
        },
      ],
    };

    expect(checkSemantic(schema, STDLIB).map((issue) => issue.code)).not.toContain(
      'relationship_ownership_scope_missing',
    );
  });

  it('warns from shared string tenant-axis fields during string-FK migrations', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [{ name: 'householdId', type: { kind: 'string' } }],
        },
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'string' } },
            { name: 'recipeId', type: { kind: 'ref', typeName: 'Recipe' } },
          ],
        },
      ],
    };

    expect(checkSemantic(schema, STDLIB)).toEqual([
      expect.objectContaining({
        code: 'relationship_ownership_scope_missing',
        severity: 'warning',
        message: expect.stringContaining('tenant axis "householdId"'),
      }),
    ]);
  });

  it('does not use audit fields as tenant axes for missing ownership warnings', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Household', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Ingredient',
          table: true,
          fields: [
            { name: 'name', type: { kind: 'string' } },
            { name: 'createdAt', type: { kind: 'string' } },
            { name: 'updatedAt', type: { kind: 'string' } },
          ],
        },
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'string' } },
            { name: 'createdAt', type: { kind: 'string' } },
            { name: 'updatedAt', type: { kind: 'string' } },
          ],
        },
        {
          kind: 'object',
          name: 'PantryItem',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'string' } },
            { name: 'createdAt', type: { kind: 'string' } },
            { name: 'updatedAt', type: { kind: 'string' } },
            { name: 'recipeId', type: { kind: 'ref', typeName: 'Recipe' } },
            { name: 'ingredientId', type: { kind: 'ref', typeName: 'Ingredient' } },
            { name: 'householdRefId', type: { kind: 'ref', typeName: 'Household' } },
          ],
        },
      ],
    };

    const warnings = checkSemantic(schema, STDLIB).filter(
      (issue) => issue.code === 'relationship_ownership_scope_missing',
    );
    expect(warnings).toEqual([
      expect.objectContaining({
        path: 'types.3.fields.3.type.relationship.ownership',
        message: expect.stringContaining('tenant axis "householdId"'),
        hint: expect.stringContaining('scopeField: "householdId"'),
      }),
    ]);
    expect(JSON.stringify(warnings)).not.toContain('createdAt');
    expect(JSON.stringify(warnings)).not.toContain('updatedAt');
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

  it('rejects duplicate emitted Convex table names', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Artwork', table: true, tableName: 'artworks', fields: [] },
        { kind: 'object', name: 'Artworks', table: true, fields: [] },
      ],
    };

    const issues = checkSemantic(schema, STDLIB);

    expect(issues.some((i) => i.code === 'duplicate_convex_table_name')).toBe(true);
  });

  it('rejects Convex table and field names reserved by Convex', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: '_Private',
          table: true,
          fields: [{ name: '_secret', type: { kind: 'string' } }],
        },
      ],
    };

    const issues = checkSemantic(schema, STDLIB);

    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['convex_reserved_table_name', 'convex_reserved_field_name']),
    );
  });

  it('rejects Convex indexes that reference missing fields', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'slug', type: { kind: 'string' } }],
          indexes: [{ name: 'by_author', fields: ['authorId'] }],
        },
      ],
    };

    const issues = checkSemantic(schema, STDLIB);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'convex_index_unknown_field',
          path: 'types.0.indexes.0.fields.0',
        }),
      ]),
    );
  });
});

describe('checkSemantic — discriminated unions', () => {
  it('passes when all variants are objects with the discriminator', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Click',
          fields: [
            { name: 'type', type: { kind: 'literal', value: 'click' } },
            { name: 'x', type: { kind: 'number' } },
          ],
        },
        {
          kind: 'object',
          name: 'Hover',
          fields: [
            { name: 'type', type: { kind: 'literal', value: 'hover' } },
            { name: 'target', type: { kind: 'string' } },
          ],
        },
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['Click', 'Hover'],
        },
      ],
    };
    expect(
      checkSemantic(schema, STDLIB).filter((i) => i.code.startsWith('discriminator_')),
    ).toEqual([]);
  });

  it('rejects missing, non-object, and missing-discriminator variants', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'enum', name: 'Color', values: [{ value: 'red' }] },
        { kind: 'object', name: 'Click', fields: [{ name: 'x', type: { kind: 'number' } }] },
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['Missing', 'Color', 'Click'],
        },
      ],
    };
    expect(checkSemantic(schema, STDLIB).map((i) => i.code)).toEqual([
      'discriminator_variant_not_found',
      'discriminator_variant_not_object',
      'discriminator_missing_on_variant',
    ]);
  });
});

describe('checkSemantic — enums', () => {
  it('rejects empty enums and duplicate enum values', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'enum', name: 'Empty', values: [] },
        {
          kind: 'enum',
          name: 'Role',
          values: [{ value: 'admin' }, { value: 'member' }, { value: 'admin' }],
        },
      ],
    };
    expect(checkSemantic(schema, STDLIB).map((i) => i.code)).toEqual([
      'enum_empty',
      'enum_duplicate_value',
    ]);
  });
});
