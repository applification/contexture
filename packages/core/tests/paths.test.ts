import { describe, expect, it } from 'vitest';
import {
  assertContextureIrPath,
  assertWritableContextureProjectIrPath,
  bundlePathsFor,
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

  it('allows write-capable operations only for project IR paths', () => {
    expect(
      assertWritableContextureProjectIrPath('/repo/packages/contexture/app.contexture.json'),
    ).toBe('/repo/packages/contexture/app.contexture.json');
    expect(() => assertWritableContextureProjectIrPath('/repo/app.contexture.json')).toThrow(
      /packages\/contexture/,
    );
  });
});
