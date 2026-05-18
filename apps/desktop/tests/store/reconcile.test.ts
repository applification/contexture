import { targetKindFor } from '@renderer/store/reconcile';
import { describe, expect, it } from 'vitest';

describe('targetKindFor', () => {
  const irPath = '/proj/packages/contexture/garden.contexture.json';

  it('detects convex schema', () => {
    expect(targetKindFor('/proj/packages/contexture/convex/schema.ts', irPath)).toBe('convex');
  });

  it('detects zod .schema.ts', () => {
    expect(targetKindFor('/proj/packages/contexture/garden.schema.ts', irPath)).toBe('zod');
  });

  it('detects JSON schema .schema.json', () => {
    expect(targetKindFor('/proj/packages/contexture/garden.schema.json', irPath)).toBe(
      'json-schema',
    );
  });

  it('detects schema-index index.ts', () => {
    expect(targetKindFor('/proj/packages/contexture/index.ts', irPath)).toBe('schema-index');
  });

  it('uses the core generated target registry when the open IR path is known', () => {
    expect(
      targetKindFor('/proj/packages/contexture/.contexture/ai-tool-schemas.json', irPath),
    ).toBe('ai-tool-schemas');
    expect(targetKindFor('/proj/packages/contexture/form-validators.ts', irPath)).toBe(
      'form-validators',
    );
    expect(targetKindFor('/proj/packages/contexture/src/index.ts', irPath)).toBe('unknown');
  });

  it('returns unknown for unrecognised paths', () => {
    expect(targetKindFor('/proj/packages/contexture/CLAUDE.md')).toBe('unknown');
  });

  it('returns unknown for an empty string', () => {
    expect(targetKindFor('')).toBe('unknown');
  });

  it('does not guess target kinds without the open IR path', () => {
    expect(targetKindFor('/proj/packages/contexture/garden.schema.ts')).toBe('unknown');
    expect(targetKindFor('/proj/packages/contexture/src/index.ts')).toBe('unknown');
  });
});
