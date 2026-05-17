import { homedir } from 'node:os';
import { join, parse } from 'node:path';
import {
  assertGeneratedTargetForIr,
  assertSafeRecursiveDeleteTarget,
  isSafeExternalUrl,
} from '@main/security';
import { describe, expect, it } from 'vitest';

describe('main security guards', () => {
  it('allows only expected external window-open protocols', () => {
    expect(isSafeExternalUrl('https://contexture.dev')).toBe(true);
    expect(isSafeExternalUrl('http://localhost:3000')).toBe(true);
    expect(isSafeExternalUrl('mailto:hello@example.com')).toBe(true);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('vscode://file/tmp/project')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
  });

  it('accepts generated targets derived from the open IR', () => {
    const irPath = '/repo/packages/contexture/garden.contexture.json';
    expect(assertGeneratedTargetForIr(irPath, '/repo/packages/contexture/garden.schema.ts')).toBe(
      '/repo/packages/contexture/garden.schema.ts',
    );
    expect(assertGeneratedTargetForIr(irPath, '/repo/packages/contexture/convex/schema.ts')).toBe(
      '/repo/packages/contexture/convex/schema.ts',
    );
    expect(
      assertGeneratedTargetForIr(
        irPath,
        '/repo/packages/contexture/.contexture/mcp-definitions.json',
      ),
    ).toBe('/repo/packages/contexture/.contexture/mcp-definitions.json');
  });

  it('rejects user-owned paths that are not generated targets for the IR', () => {
    const irPath = '/repo/packages/contexture/garden.contexture.json';
    expect(() =>
      assertGeneratedTargetForIr(irPath, '/repo/packages/contexture/src/index.ts'),
    ).toThrow(/not a generated Contexture artifact/);
  });

  it('rejects dangerous recursive delete targets', () => {
    const root = parse(homedir()).root;
    expect(() => assertSafeRecursiveDeleteTarget(root)).toThrow(/root/);
    expect(() => assertSafeRecursiveDeleteTarget(homedir())).toThrow(/home/);
    expect(() => assertSafeRecursiveDeleteTarget('relative/project')).toThrow(/absolute/);
  });

  it('allows a nested absolute recursive delete target', () => {
    const target = join(parse(homedir()).root, 'tmp', 'contexture-delete-me');
    expect(assertSafeRecursiveDeleteTarget(target)).toBe(target);
  });
});
