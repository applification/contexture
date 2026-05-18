import { describe, expect, it } from 'vitest';
import {
  buildSidecarEntries,
  bundlePathsFor,
  detectDocumentMode,
  initializeDocumentBundle,
  type Schema,
} from '../src';

const schema: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Plot', table: true, fields: [] }],
};

describe('document bundle policy', () => {
  it('detects bundle mode from the .contexture sidecar directory', async () => {
    const seen: string[] = [];
    const mode = await detectDocumentMode('/repo/app.contexture.json', {
      async dirExists(path) {
        seen.push(path);
        return path === '/repo/.contexture';
      },
    });

    expect(mode).toBe('bundle');
    expect(seen).toEqual(['/repo/.contexture']);
  });

  it('derives sidecar entries from bundle paths', () => {
    const paths = bundlePathsFor('/repo/app.contexture.json');

    expect(buildSidecarEntries(paths, { layout: 'layout', chat: 'chat' })).toEqual([
      { kind: 'layout', path: '/repo/.contexture/layout.json', content: 'layout' },
      { kind: 'chat', path: '/repo/.contexture/chat.json', content: 'chat' },
    ]);
  });

  it('initializes a bundle with IR, sidecars, generated targets, and manifest only', async () => {
    const files = new Map<string, string>();
    const fs = {
      async readFile(path: string) {
        const value = files.get(path);
        if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return value;
      },
      async writeFile(path: string, content: string) {
        files.set(path, content);
      },
      async rename(from: string, to: string) {
        const value = files.get(from);
        if (value === undefined) throw new Error('missing tmp');
        files.set(to, value);
        files.delete(from);
      },
      async remove(path: string) {
        files.delete(path);
      },
      async mkdirp(path: string) {
        files.set(`${path}/.keep`, '');
      },
    };

    await initializeDocumentBundle({
      irPath: '/repo/app.contexture.json',
      schema,
      fs,
      sidecars: { layout: { version: '1', positions: { Plot: { x: 1, y: 2 } } } },
    });

    expect(files.has('/repo/app.contexture.json')).toBe(true);
    expect(files.has('/repo/.contexture/layout.json')).toBe(true);
    expect(files.has('/repo/.contexture/chat.json')).toBe(true);
    expect(files.has('/repo/.contexture/emitted.json')).toBe(true);
    expect(files.has('/repo/app.schema.ts')).toBe(true);
    expect(files.has('/repo/AGENTS.md')).toBe(false);
    expect(files.has('/repo/CLAUDE.md')).toBe(false);
    expect(files.has('/repo/convex/Plot.ts')).toBe(false);
  });
});
