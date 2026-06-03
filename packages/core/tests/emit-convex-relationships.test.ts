import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { emitConvexRelationships, type Schema } from '../src';

function parses(source: string): boolean {
  const sf = ts.createSourceFile('relationships.ts', source, ts.ScriptTarget.Latest, false);
  return (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics.length === 0;
}

function emittedRelationships(source: string): Array<{
  name: string;
  fromTable: string;
  fromField: string;
  fromPath: string[];
  toTable: string;
}> {
  const match = source.match(/export const relationships = (\[[\s\S]*?\]) as const/);
  const json = match?.[1];
  if (!json) return [];
  return JSON.parse(json);
}

describe('emitConvexRelationships', () => {
  it('emits relationship metadata and generic app-layer helpers for table refs', () => {
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

    const out = emitConvexRelationships(schema, 'plantry.contexture.json');

    expect(out).toContain('Source: plantry.contexture.json');
    expect(out).toContain('"fromTable": "mealPlanMeal"');
    expect(out).toContain('"fromField": "recipeId"');
    expect(out).toContain('"fromPath": [\n      "recipeId"\n    ]');
    expect(out).toContain('"toTable": "recipe"');
    expect(out).toContain('"onDelete": "restrict"');
    expect(out).toContain('export async function assertContextureRefs');
    expect(out).toContain('export async function deleteWithContextureRelations');
    expect(parses(out)).toBe(true);
  });

  it('registers refs inside embedded object paths from each root table', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Ingredient',
          table: true,
          fields: [{ name: 'householdId', type: { kind: 'string' } }],
        },
        {
          kind: 'object',
          name: 'RecipeIngredient',
          fields: [{ name: 'ingredientId', type: { kind: 'ref', typeName: 'Ingredient' } }],
        },
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'string' } },
            {
              name: 'ingredients',
              type: { kind: 'array', element: { kind: 'ref', typeName: 'RecipeIngredient' } },
            },
          ],
        },
        {
          kind: 'object',
          name: 'PantryItem',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'string' } },
            { name: 'ingredient', type: { kind: 'ref', typeName: 'RecipeIngredient' } },
          ],
        },
      ],
    };

    const out = emitConvexRelationships(schema);

    expect(out).toContain('"name": "Recipe.ingredients.[].ingredientId"');
    expect(out).toContain('"fromTable": "recipe"');
    expect(out).toContain('"fromField": "ingredientId"');
    expect(out).toContain(
      '"fromPath": [\n      "ingredients",\n      "[]",\n      "ingredientId"\n    ]',
    );
    expect(out).toContain('"name": "PantryItem.ingredient.ingredientId"');
    expect(out).toContain('"fromPath": [\n      "ingredient",\n      "ingredientId"\n    ]');
    expect(out).toContain('collectContexturePathValues(input, relationship.fromPath)');
    expect(parses(out)).toBe(true);
  });

  it('keeps reused embedded ref occurrences distinct by name and path', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Ingredient',
          table: true,
          fields: [],
        },
        {
          kind: 'object',
          name: 'FoodPreference',
          fields: [{ name: 'ingredientId', type: { kind: 'ref', typeName: 'Ingredient' } }],
        },
        {
          kind: 'object',
          name: 'Household',
          table: true,
          fields: [
            {
              name: 'preferences',
              type: { kind: 'array', element: { kind: 'ref', typeName: 'FoodPreference' } },
            },
          ],
        },
        {
          kind: 'object',
          name: 'HouseholdMember',
          table: true,
          fields: [
            {
              name: 'preferences',
              type: { kind: 'array', element: { kind: 'ref', typeName: 'FoodPreference' } },
            },
          ],
        },
      ],
    };

    const out = emitConvexRelationships(schema);
    const relationships = emittedRelationships(out);

    expect(relationships).toEqual([
      expect.objectContaining({
        name: 'Household.preferences.[].ingredientId',
        fromTable: 'household',
        fromField: 'ingredientId',
        fromPath: ['preferences', '[]', 'ingredientId'],
        toTable: 'ingredient',
      }),
      expect.objectContaining({
        name: 'HouseholdMember.preferences.[].ingredientId',
        fromTable: 'householdMember',
        fromField: 'ingredientId',
        fromPath: ['preferences', '[]', 'ingredientId'],
        toTable: 'ingredient',
      }),
    ]);
    expect(new Set(relationships.map((relationship) => relationship.name)).size).toBe(2);
    expect(new Set(relationships.map((relationship) => relationship.fromField)).size).toBe(1);
    expect(parses(out)).toBe(true);
  });

  it('does not auto-derive ownership scope when source and target share a scope field', () => {
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

    const out = emitConvexRelationships(schema);

    expect(out).toContain('"name": "MealPlanMeal.recipeId"');
    expect(out).toContain('"ownershipScopeField": null');
    expect(out).toContain('"targetOwnershipScopeField": null');
  });

  it('emits explicit ownership metadata', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Tenant', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [
            { name: 'tenantId', type: { kind: 'ref', typeName: 'Tenant' } },
            { name: 'regionId', type: { kind: 'string' } },
          ],
        },
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [
            { name: 'tenantId', type: { kind: 'ref', typeName: 'Tenant' } },
            { name: 'regionId', type: { kind: 'string' } },
            {
              name: 'recipeId',
              type: {
                kind: 'ref',
                typeName: 'Recipe',
                relationship: {
                  ownership: { scopeField: 'regionId', targetScopeField: 'regionId' },
                },
              },
            },
          ],
        },
      ],
    };

    const out = emitConvexRelationships(schema);

    expect(out).toContain('"ownershipScopeField": "regionId"');
    expect(out).toContain('"targetOwnershipScopeField": "regionId"');
  });
});
