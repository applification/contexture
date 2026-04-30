import { convexPathFor, emittedPathFor } from '@renderer/hooks/useDrift';
import { describe, expect, it } from 'vitest';

describe('emittedPathFor', () => {
  it('derives emitted.json path from a valid IR path', () => {
    const ir = '/proj/packages/contexture/garden.contexture.json';
    expect(emittedPathFor(ir)).toBe('/proj/packages/contexture/.contexture/emitted.json');
  });

  it('returns null for a non-IR path', () => {
    expect(emittedPathFor('/proj/packages/contexture/schema.ts')).toBeNull();
  });

  it('returns null for a path with no slash', () => {
    expect(emittedPathFor('garden.contexture.json')).toBeNull();
  });

  it('handles deeply nested IR paths', () => {
    const ir = '/a/b/c/d/garden.contexture.json';
    expect(emittedPathFor(ir)).toBe('/a/b/c/d/.contexture/emitted.json');
  });
});

describe('convexPathFor', () => {
  it('derives convex schema path from a valid IR path', () => {
    const ir = '/proj/packages/contexture/garden.contexture.json';
    expect(convexPathFor(ir)).toBe('/proj/packages/contexture/convex/schema.ts');
  });

  it('returns null for a non-IR path', () => {
    expect(convexPathFor('/proj/packages/contexture/schema.ts')).toBeNull();
  });

  it('returns null for a path with no slash', () => {
    expect(convexPathFor('garden.contexture.json')).toBeNull();
  });
});
