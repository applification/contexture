import { describe, expect, it } from 'vitest';
import type { Schema } from '../src';
import {
  assertContextureIrPath,
  bundlePathsFor,
  generatedTargetForPath,
  generatedTargetsFor,
  manifestKeyForGeneratedPath,
  moduleSpecifierBetween,
  resolveManifestGeneratedPath,
  sourceLabelForIrPath,
} from '../src';

describe('Contexture path policy', () => {
  it('normalizes .contexture.json paths before deriving generated bundle paths', () => {
    const paths = bundlePathsFor('/repo/packages/contexture/../contexture/app.contexture.json');
    expect(paths.ir).toBe('/repo/packages/contexture/app.contexture.json');
    expect(paths.schemaIndex).toBe('/repo/packages/contexture/index.ts');
    expect(paths.convex).toBe('/repo/packages/contexture/convex/schema.ts');
    expect(paths.convexValidators).toBe('/repo/packages/contexture/convex/validators.ts');
  });

  it('emits app-root schema and framework outputs when the IR lives at the app root', () => {
    const paths = bundlePathsFor('/repo/apps/misprint/misprint.contexture.json');
    expect(paths.ir).toBe('/repo/apps/misprint/misprint.contexture.json');
    expect(paths.schemaTs).toBe('/repo/apps/misprint/schema/misprint.schema.ts');
    expect(paths.schemaJson).toBe('/repo/apps/misprint/schema/misprint.schema.json');
    expect(paths.schemaIndex).toBe('/repo/apps/misprint/schema/index.ts');
    expect(paths.formValidators).toBe('/repo/apps/misprint/schema/form-validators.ts');
    expect(paths.stdlibRuntimeDir).toBe('/repo/apps/misprint/schema/contexture-runtime');
    expect(paths.convex).toBe('/repo/apps/misprint/convex/schema.ts');
    expect(paths.convexValidators).toBe('/repo/apps/misprint/convex/validators.ts');
    expect(paths.emitted).toBe('/repo/apps/misprint/.contexture/emitted.json');
  });

  it('rejects non-IR paths', () => {
    expect(() => assertContextureIrPath('/repo/packages/contexture/app.schema.json')).toThrow(
      /Expected a \.contexture\.json path/,
    );
  });

  it('derives one generated target registry for every emitted artifact path', () => {
    const irPath = '/repo/packages/contexture/app.contexture.json';
    expect(generatedTargetsFor(irPath)).toEqual([
      { kind: 'zod', path: '/repo/packages/contexture/app.schema.ts' },
      { kind: 'json-schema', path: '/repo/packages/contexture/app.schema.json' },
      { kind: 'schema-index', path: '/repo/packages/contexture/index.ts' },
      { kind: 'convex', path: '/repo/packages/contexture/convex/schema.ts' },
      { kind: 'convex-validators', path: '/repo/packages/contexture/convex/validators.ts' },
      {
        kind: 'convex-relationships',
        path: '/repo/packages/contexture/convex/relationships.ts',
      },
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

  it('derives generated target paths from configured output directories', () => {
    const irPath = '/repo/app.contexture.json';
    const schema: Schema = {
      version: '1',
      types: [],
      outputs: {
        zod: { dir: 'packages/domain/src/generated' },
        stdlibRuntime: { dir: 'packages/domain/src/runtime' },
        schemaIndex: { dir: 'packages/domain/src' },
        convex: { dir: 'apps/api/convex' },
      },
    };

    expect(generatedTargetsFor(irPath, schema)).toContainEqual({
      kind: 'zod',
      path: '/repo/packages/domain/src/generated/app.schema.ts',
    });
    expect(generatedTargetsFor(irPath, schema)).toContainEqual({
      kind: 'convex-validators',
      path: '/repo/apps/api/convex/validators.ts',
    });
    expect(bundlePathsFor(irPath, schema).stdlibRuntimeDir).toBe(
      '/repo/packages/domain/src/runtime',
    );
    expect(
      generatedTargetForPath(irPath, '/repo/packages/domain/src/generated/app.schema.ts', schema)
        ?.kind,
    ).toBe('zod');
    expect(resolveManifestGeneratedPath(irPath, 'apps/api/convex/schema.ts', schema)).toBe(
      '/repo/apps/api/convex/schema.ts',
    );
  });

  it('rejects output directories that escape the IR directory', () => {
    const schema: Schema = {
      version: '1',
      types: [],
      outputs: {
        zod: { dir: '../outside' },
      },
    };

    expect(() => bundlePathsFor('/repo/app.contexture.json', schema)).toThrow(
      /must stay within the IR directory/,
    );
  });

  it('derives TypeScript module specifiers between generated files', () => {
    expect(
      moduleSpecifierBetween(
        '/repo/packages/domain/src/index.ts',
        '/repo/packages/domain/src/generated/app.schema.ts',
      ),
    ).toBe('./generated/app.schema');
  });

  it('derives checkout-stable source labels and manifest keys', () => {
    const irPath = '/Users/rufus/Apps/plantry/plantry.contexture.json';
    expect(sourceLabelForIrPath(irPath)).toBe('plantry.contexture.json');
    expect(manifestKeyForGeneratedPath(irPath, '/Users/rufus/Apps/plantry/convex/schema.ts')).toBe(
      'convex/schema.ts',
    );
    expect(
      resolveManifestGeneratedPath(
        '/Users/davehudson/Apps/plantry/plantry.contexture.json',
        '/Users/rufus/Apps/plantry/convex/schema.ts',
      ),
    ).toBe('/Users/davehudson/Apps/plantry/convex/schema.ts');
  });
});
