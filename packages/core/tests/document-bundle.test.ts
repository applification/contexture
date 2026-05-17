import { describe, expect, it } from 'vitest';
import {
  buildSeededArtifacts,
  buildSidecarEntries,
  bundlePathsFor,
  detectDocumentMode,
  type Schema,
} from '../src';

const schema: Schema = {
  version: '1',
  types: [
    { kind: 'object', name: 'Plot', table: true, fields: [] },
    { kind: 'object', name: 'Inline', fields: [] },
  ],
};

describe('document bundle policy', () => {
  it('detects project mode from the .contexture sidecar directory', async () => {
    const seen: string[] = [];
    const mode = await detectDocumentMode('/repo/packages/contexture/app.contexture.json', {
      async dirExists(path) {
        seen.push(path);
        return path === '/repo/packages/contexture/.contexture';
      },
    });

    expect(mode).toBe('project');
    expect(seen).toEqual(['/repo/packages/contexture/.contexture']);
  });

  it('derives project seeded artifacts from the IR path and table flags', () => {
    const artifacts = buildSeededArtifacts(
      schema,
      '/repo/packages/contexture/app.contexture.json',
      {
        emitAgentMd: (projectName) => `agent:${projectName}`,
        emitClaudeMd: (projectName) => `claude:${projectName}`,
        emitTableCrud: (_schema, tableName) => `crud:${tableName}`,
      },
    );

    expect(artifacts).toEqual([
      { kind: 'agent-guidance', path: '/repo/AGENTS.md', content: 'agent:app' },
      { kind: 'claude-guidance', path: '/repo/CLAUDE.md', content: 'claude:app' },
      {
        kind: 'table-crud',
        path: '/repo/packages/contexture/convex/Plot.ts',
        content: 'crud:Plot',
      },
    ]);
  });

  it('does not seed artifacts for scratch-style IR paths outside project layout', () => {
    expect(buildSeededArtifacts(schema, '/tmp/app.contexture.json')).toEqual([]);
  });

  it('derives sidecar entries from bundle paths', () => {
    const paths = bundlePathsFor('/repo/packages/contexture/app.contexture.json');

    expect(buildSidecarEntries(paths, { layout: 'layout', chat: 'chat' })).toEqual([
      {
        kind: 'layout',
        path: '/repo/packages/contexture/.contexture/layout.json',
        content: 'layout',
      },
      { kind: 'chat', path: '/repo/packages/contexture/.contexture/chat.json', content: 'chat' },
    ]);
  });
});
