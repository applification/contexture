import { describe, expect, it } from 'vitest';
import {
  assertContextureIrPath,
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
    expect(paths.convexValidators).toBe('/repo/packages/contexture/convex/validators.ts');
  });

  it('emits app-root schema and framework outputs when the IR lives at the app root', () => {
    const paths = bundlePathsFor('/repo/apps/misprint/misprint.contexture.json');
    expect(paths.ir).toBe('/repo/apps/misprint/misprint.contexture.json');
    expect(paths.schemaTs).toBe('/repo/apps/misprint/schema/misprint.schema.ts');
    expect(paths.schemaJson).toBe('/repo/apps/misprint/schema/misprint.schema.json');
    expect(paths.schemaIndex).toBe('/repo/apps/misprint/schema/index.ts');
    expect(paths.formValidators).toBe('/repo/apps/misprint/schema/form-validators.ts');
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
