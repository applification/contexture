import { targetKindFor } from '@renderer/store/reconcile';
import { describe, expect, it } from 'vitest';

describe('targetKindFor', () => {
  it('detects convex schema', () => {
    expect(targetKindFor('/proj/packages/contexture/convex/schema.ts')).toBe('convex');
  });

  it('detects zod .schema.ts', () => {
    expect(targetKindFor('/proj/packages/contexture/garden.schema.ts')).toBe('zod');
  });

  it('detects JSON schema .schema.json', () => {
    expect(targetKindFor('/proj/packages/contexture/garden.schema.json')).toBe('json-schema');
  });

  it('detects schema-index index.ts', () => {
    expect(targetKindFor('/proj/packages/contexture/index.ts')).toBe('schema-index');
  });

  it('returns unknown for unrecognised paths', () => {
    expect(targetKindFor('/proj/packages/contexture/CLAUDE.md')).toBe('unknown');
  });

  it('does not confuse a non-convex schema.ts with convex', () => {
    expect(targetKindFor('/proj/packages/other/schema.ts')).toBe('unknown');
  });

  it('returns unknown for an empty string', () => {
    expect(targetKindFor('')).toBe('unknown');
  });

  it('does not match index.ts without a leading slash', () => {
    expect(targetKindFor('index.ts')).toBe('unknown');
  });

  it('does not match convex/schema.ts without a leading slash', () => {
    expect(targetKindFor('convex/schema.ts')).toBe('unknown');
  });

  it('does not confuse a nested index.ts under a non-schema directory', () => {
    // /index.ts suffix matches any /index.ts — that is expected behaviour per the
    // bundlePathsFor contract, but confirm a deeply-nested path still resolves.
    expect(targetKindFor('/proj/packages/contexture/src/index.ts')).toBe('schema-index');
  });
});
