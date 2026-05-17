import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import {
  assertGeneratedTargetForIr,
  assertSafeContextureIrPath,
  assertSafeRecursiveDeleteTarget,
  isSafeExternalUrl,
} from '@main/security';
import { rendererContentSecurityPolicy } from '@shared/renderer-csp';
import { describe, expect, it } from 'vitest';

function cspDirective(policy: string, name: string): string | undefined {
  const directive = policy.split('; ').find((part) => part.startsWith(`${name} `));
  return directive?.slice(name.length + 1);
}

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

  it('accepts only absolute Contexture IR paths for desktop IPC file authority', () => {
    expect(assertSafeContextureIrPath('/repo/packages/contexture/garden.contexture.json')).toBe(
      '/repo/packages/contexture/garden.contexture.json',
    );
    expect(() => assertSafeContextureIrPath('garden.contexture.json')).toThrow(/absolute/);
    expect(() => assertSafeContextureIrPath('/repo/packages/contexture/schema.ts')).toThrow(
      /Expected a .contexture.json/,
    );
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

  it('injects a production renderer CSP that only loads bundled fonts', () => {
    const csp = rendererContentSecurityPolicy('build');
    expect(cspDirective(csp, 'script-src')).toBe("'self'");
    expect(cspDirective(csp, 'font-src')).toBe("'self' data:");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain('fonts.googleapis.com');
    expect(csp).not.toContain('fonts.gstatic.com');
  });

  it('relaxes only the dev renderer CSP needed by React Refresh and HMR', () => {
    const csp = rendererContentSecurityPolicy('serve');
    expect(cspDirective(csp, 'script-src')).toBe("'self' 'unsafe-inline'");
    expect(cspDirective(csp, 'connect-src')).toBe("'self' http: https: ws:");
    expect(cspDirective(csp, 'font-src')).toBe("'self' data:");
  });

  it('self-hosts renderer fonts instead of loading Google Fonts', async () => {
    const css = await readFile(resolve(process.cwd(), 'src/renderer/src/globals.css'), 'utf8');
    expect(css).toContain("url('./assets/fonts/Geist-Variable.woff2')");
    expect(css).toContain("url('./assets/fonts/GeistMono-Variable.woff2')");
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('fonts.gstatic.com');
  });

  it('leaves CSP injection to the Vite renderer config', async () => {
    const html = await readFile(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8');
    expect(html).not.toContain('http-equiv="Content-Security-Policy"');
  });
});
