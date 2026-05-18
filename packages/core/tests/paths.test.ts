import { describe, expect, it } from 'vitest';
import {
  assertContextureIrPath,
  assertWritableContextureBundleIrPath,
  bundlePathsFor,
  generatedTargetForPath,
  generatedTargetsFor,
} from '../src';

describe('Contexture path policy', () => {
  it('normalizes .contexture.json paths before deriving generated bundle paths', () => {
    const paths = bundlePathsFor('/repo/packages/contexture/../contexture/app.contexture.json');
    expect(paths.ir).toBe('/repo/packages/contexture/app.contexture.json');
    expect(paths.schemaIndex).toBe('/repo/packages/contexture/index.ts');
    expect(paths.convex).toBe('/repo/packages/contexture/convex/schema.ts');
  });

  it('rejects non-IR paths', () => {
    expect(() => assertContextureIrPath('/repo/packages/contexture/app.schema.json')).toThrow(
      /Expected a \.contexture\.json path/,
    );
  });

  it('allows write-capable operations only when the sibling .contexture directory exists', async () => {
    await expect(
      assertWritableContextureBundleIrPath('/repo/app.contexture.json', {
        dirExists: async (path) => path === '/repo/.contexture',
      }),
    ).resolves.toBe('/repo/app.contexture.json');
    await expect(
      assertWritableContextureBundleIrPath('/repo/app.contexture.json', {
        dirExists: async () => false,
      }),
    ).rejects.toThrow(/bundle mode/);
  });

  it('derives one generated target registry for every emitted artifact path', () => {
    const irPath = '/repo/packages/contexture/app.contexture.json';
    expect(generatedTargetsFor(irPath)).toEqual([
      { kind: 'zod', path: '/repo/packages/contexture/app.schema.ts' },
      { kind: 'json-schema', path: '/repo/packages/contexture/app.schema.json' },
      { kind: 'schema-index', path: '/repo/packages/contexture/index.ts' },
      { kind: 'convex', path: '/repo/packages/contexture/convex/schema.ts' },
      {
        kind: 'ai-tool-schemas',
        path: '/repo/packages/contexture/.contexture/ai-tool-schemas.json',
      },
      {
        kind: 'structured-output-schemas',
        path: '/repo/packages/contexture/.contexture/structured-output-schemas.json',
      },
      {
        kind: 'mcp-definitions',
        path: '/repo/packages/contexture/.contexture/mcp-definitions.json',
      },
      { kind: 'form-validators', path: '/repo/packages/contexture/form-validators.ts' },
    ]);
    expect(
      generatedTargetForPath(
        irPath,
        '/repo/packages/contexture/.contexture/../.contexture/mcp-definitions.json',
      )?.kind,
    ).toBe('mcp-definitions');
    expect(generatedTargetForPath(irPath, '/repo/packages/contexture/src/index.ts')).toBeNull();
  });
});
