import { labelForRefEdge } from '@renderer/components/graph/edges/RefEdge';
import type { RefEdgeData } from '@renderer/components/graph/schema-to-graph';
import { describe, expect, it } from 'vitest';

describe('labelForRefEdge', () => {
  it('labels modeled refs and union variants, but not inferred table-id hints', () => {
    const modeled: RefEdgeData = {
      relation: 'fieldRef',
      sourceType: 'MealPlan',
      sourceField: 'householdId',
      targetType: 'Household',
      crossBoundary: false,
    };
    const inferred: RefEdgeData = {
      relation: 'tableId',
      sourceType: 'Household',
      sourceField: 'ownerUserId',
      targetType: 'User',
      crossBoundary: false,
    };
    const union: RefEdgeData = {
      relation: 'unionVariant',
      sourceType: 'MealTarget',
      targetType: 'RecipeTarget',
      discriminator: 'kind',
      crossBoundary: false,
    };

    expect(labelForRefEdge(modeled)).toBe('householdId');
    expect(labelForRefEdge(inferred)).toBeUndefined();
    expect(labelForRefEdge(union)).toBe('variant');
  });
});
