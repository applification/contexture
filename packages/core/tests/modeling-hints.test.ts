import { describe, expect, it } from 'vitest';
import type { Schema } from '../src/ir';
import { analyzeModelingHints } from '../src/modeling-hints';

const misprintSlice: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Artwork',
      table: true,
      fields: [
        { name: 'slug', type: { kind: 'string' } },
        {
          name: 'sourceKind',
          description: 'Denormalized source category for filtering artwork lists.',
          type: { kind: 'string' },
        },
        {
          name: 'sourceSearchText',
          description: 'Denormalized lowercase search text assembled from source metadata.',
          type: { kind: 'string' },
        },
        {
          name: 'media',
          type: { kind: 'array', element: { kind: 'ref', typeName: 'ArtworkMedia' } },
        },
        {
          name: 'palette',
          type: { kind: 'array', element: { kind: 'ref', typeName: 'ArtworkPaletteColor' } },
        },
      ],
      indexes: [{ name: 'by_source_kind', fields: ['sourceKind'] }],
    },
    {
      kind: 'object',
      name: 'ArtworkMedia',
      fields: [
        { name: 'storageId', type: { kind: 'string' } },
        { name: 'url', type: { kind: 'string', format: 'url' } },
        { name: 'alt', type: { kind: 'string' } },
      ],
    },
    {
      kind: 'object',
      name: 'ArtworkPaletteColor',
      fields: [
        { name: 'hex', type: { kind: 'string' } },
        { name: 'sortOrder', type: { kind: 'number' } },
        { name: 'notes', type: { kind: 'string' }, optional: true },
      ],
    },
  ],
};

describe('analyzeModelingHints', () => {
  it('identifies identity pressure on embedded objects without making validation issues', () => {
    const hints = analyzeModelingHints(misprintSlice);

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'possible_entity',
          typeName: 'ArtworkMedia',
          title: 'Possible entity',
          signals: ['identity_pressure'],
          fieldNames: ['storageId', 'url'],
        }),
      ]),
    );
  });

  it('identifies query handles on table fields including denormalized search fields', () => {
    const hints = analyzeModelingHints(misprintSlice);
    const queryHandles = hints
      .filter((hint) => hint.kind === 'query_handle')
      .map((hint) => hint.fieldName);

    expect(queryHandles).toEqual(
      expect.arrayContaining(['slug', 'sourceKind', 'sourceSearchText']),
    );
    expect(hints.find((hint) => hint.fieldName === 'sourceSearchText')?.message).toMatch(
      /denormalized/i,
    );
  });

  it('surfaces incomplete derivation policy on stored computed fields', () => {
    const hints = analyzeModelingHints({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [
            { name: 'ingredients', type: { kind: 'array', element: { kind: 'string' } } },
            {
              name: 'nutrition',
              type: { kind: 'string' },
              derivation: { kind: 'computed', sources: ['ingredients'], owner: 'backend' },
            },
          ],
        },
      ],
    });

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'derivation_policy',
          fieldName: 'nutrition',
          title: 'Drift policy missing',
          message: expect.stringContaining('without a refresh or drift policy'),
        }),
      ]),
    );
  });

  it('treats declared snapshots as intentional context rather than drift warnings', () => {
    const hints = analyzeModelingHints({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [
            {
              name: 'recipeTitle',
              type: { kind: 'string' },
              derivation: { kind: 'snapshot', sources: ['Recipe.title'], refresh: 'frozen' },
            },
          ],
        },
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
      ],
    });

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'derivation_policy',
          fieldName: 'recipeTitle',
          title: 'Snapshot field',
          message: expect.stringContaining('frozen snapshot'),
        }),
      ]),
    );
  });

  it('identifies embedded collections and explains when the shape can remain embedded', () => {
    const hints = analyzeModelingHints(misprintSlice);

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'embedded_collection',
          typeName: 'Artwork',
          fieldName: 'media',
          signals: expect.arrayContaining([
            'embedded_collection_pressure',
            'relationship_pressure',
          ]),
        }),
      ]),
    );
    expect(hints.find((hint) => hint.fieldName === 'media')?.message).toMatch(/Keep it embedded/i);
  });

  it('warns when collaborative child rows are embedded in a table document', () => {
    const hints = analyzeModelingHints({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'ShoppingList',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'string' } },
            {
              name: 'items',
              type: { kind: 'array', element: { kind: 'ref', typeName: 'ShoppingListItem' } },
            },
          ],
        },
        {
          kind: 'object',
          name: 'ShoppingListItem',
          fields: [
            { name: 'ingredientName', type: { kind: 'string' } },
            { name: 'quantity', type: { kind: 'number' } },
            { name: 'checked', type: { kind: 'boolean' } },
          ],
        },
      ],
    });

    const itemsHint = hints.find(
      (hint) => hint.kind === 'embedded_collection' && hint.fieldName === 'items',
    );

    expect(itemsHint).toEqual(
      expect.objectContaining({
        title: 'Collaborative embedded collection',
        signals: ['embedded_collection_pressure', 'relationship_pressure', 'concurrency_pressure'],
        message: expect.stringContaining('whole-array lost updates'),
        rationale: expect.stringContaining('not independently addressable or indexable'),
      }),
    );
    expect(itemsHint?.message).toContain('stable child id');
    expect(itemsHint?.message).toContain('Convex indexes');
  });

  it('surfaces document-size pressure for embedded meal snapshots', () => {
    const hints = analyzeModelingHints({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'MealPlan',
          table: true,
          fields: [
            { name: 'weekStartDate', type: { kind: 'string' } },
            {
              name: 'meals',
              type: { kind: 'array', element: { kind: 'ref', typeName: 'MealPlanMeal' } },
            },
          ],
        },
        {
          kind: 'object',
          name: 'MealPlanMeal',
          fields: [
            { name: 'date', type: { kind: 'string' } },
            { name: 'slot', type: { kind: 'string' } },
            {
              name: 'nutritionSnapshot',
              type: { kind: 'string' },
              derivation: { kind: 'snapshot', sources: ['Recipe.nutrition'], refresh: 'frozen' },
            },
          ],
        },
      ],
    });

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'embedded_collection',
          fieldName: 'meals',
          signals: [
            'embedded_collection_pressure',
            'relationship_pressure',
            'concurrency_pressure',
            'document_size_pressure',
          ],
          message: expect.stringContaining('multiple surfaces'),
        }),
      ]),
    );
  });

  it('emits positive owned value object guidance for embedded owned structure', () => {
    const hints = analyzeModelingHints(misprintSlice);

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'owned_value_object',
          typeName: 'ArtworkPaletteColor',
          title: 'Owned value object',
        }),
      ]),
    );
  });

  it('suggests stdlib refs for primitive fields that match shared value types', () => {
    const hints = analyzeModelingHints({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Album',
          table: true,
          fields: [
            { name: 'releaseDate', type: { kind: 'string' } },
            { name: 'website', type: { kind: 'string' } },
            { name: 'country', type: { kind: 'string' } },
          ],
        },
      ],
    });

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'stdlib_type',
          fieldName: 'releaseDate',
          action: { kind: 'use_stdlib_type', typeName: 'common.ISODate' },
        }),
        expect.objectContaining({
          kind: 'stdlib_type',
          fieldName: 'website',
          action: { kind: 'use_stdlib_type', typeName: 'common.URL' },
        }),
        expect.objectContaining({
          kind: 'stdlib_type',
          fieldName: 'country',
          action: { kind: 'use_stdlib_type', typeName: 'place.CountryCode' },
        }),
      ]),
    );
  });

  it('suggests converting stringly Convex ids to refs', () => {
    const hints = analyzeModelingHints({
      version: '1',
      types: [
        { kind: 'object', name: 'Recipe', table: true, fields: [] },
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [
            { name: 'variantOfRecipeId', type: { kind: 'string' } },
            { name: 'sourceRecipeIds', type: { kind: 'array', element: { kind: 'string' } } },
          ],
        },
      ],
    });

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'stringly_ref',
          fieldName: 'variantOfRecipeId',
          action: { kind: 'convert_to_ref', typeName: 'Recipe' },
        }),
        expect.objectContaining({
          kind: 'stringly_ref',
          fieldName: 'sourceRecipeIds',
          action: { kind: 'convert_to_ref', typeName: 'Recipe' },
        }),
      ]),
    );
  });
});
