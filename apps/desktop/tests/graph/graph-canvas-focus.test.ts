import { focusedFieldFromTarget } from '@renderer/components/graph/GraphCanvas';
import { describe, expect, it } from 'vitest';

describe('focusedFieldFromTarget', () => {
  it('returns inline field focus only when the focus target names a field', () => {
    expect(focusedFieldFromTarget({ nodeId: 'Recipe', fieldName: 'season' })).toEqual({
      nodeId: 'Recipe',
      fieldName: 'season',
    });

    expect(focusedFieldFromTarget({ nodeId: 'Artwork' })).toBeNull();
  });
});
