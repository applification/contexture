import { targetKindFor } from '@renderer/store/reconcile';
import { describe, expect, it } from 'vitest';

describe('targetKindFor', () => {
  const irPath = '/proj/packages/contexture/garden.contexture.json';

  it('detects convex schema', () => {
    expect(targetKindFor('/proj/packages/contexture/convex/schema.ts', irPath)).toBe('convex');
  });

  it('detects convex relationship helpers', () => {
    expect(targetKindFor('/proj/packages/contexture/convex/relationships.ts', irPath)).toBe(
      'convex-relationships',
    );
  });

  it('detects configured Convex output directories from the current schema', () => {
    const schema = {
      version: '1',
      outputs: { convex: { dir: 'packages/convex/convex' } },
      types: [],
    } as const;

    expect(
      targetKindFor(
        '/proj/packages/contexture/packages/convex/convex/relationships.ts',
        irPath,
        schema,
      ),
    ).toBe('convex-relationships');
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
