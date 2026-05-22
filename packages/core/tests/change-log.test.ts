import { describe, expect, it } from 'vitest';
import {
  appendModelChangeLogEntry,
  buildModelChangeLogEntry,
  changeLogPathFor,
  loadModelChangeLog,
  type ModelChangeLogFs,
  pruneModelChangeLog,
  type Schema,
  summarizeModelChange,
} from '../src';

const irPath = '/work/garden.contexture.json';

const before: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Plot', fields: [] }],
};

const after: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Plot',
      fields: [{ name: 'name', type: { kind: 'string' } }],
    },
    { kind: 'object', name: 'Bed', fields: [] },
  ],
};

function memFs(
  seed: Record<string, string> = {},
): ModelChangeLogFs & { files: Map<string, string> } {
  const files = new Map(Object.entries(seed));
  return {
    files,
    async readFile(path) {
      const content = files.get(path);
      if (content === undefined) {
        const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return content;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
  };
}

describe('model change log', () => {
  it('summarizes added and changed types', () => {
    expect(summarizeModelChange(before, after)).toMatchObject({
      changedTypes: ['Plot'],
      addedTypes: ['Bed'],
      removedTypes: [],
      renamedTypes: [],
      changeCount: 2,
      summary: 'Added Bed; Updated Plot',
    });
  });

  it('detects simple renames when the type body is unchanged', () => {
    const renamed: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'AllotmentPlot', fields: [] }],
    };

    expect(summarizeModelChange(before, renamed)).toMatchObject({
      changedTypes: [],
      addedTypes: [],
      removedTypes: [],
      renamedTypes: [{ from: 'Plot', to: 'AllotmentPlot' }],
      changeCount: 1,
    });
  });

  it('appends newest-first entries and prunes to the limit', async () => {
    const fs = memFs();
    const first = buildModelChangeLogEntry({
      id: 'first',
      irPath,
      source: 'cli',
      reason: 'op_applied',
      before,
      after,
      opKind: 'add_field',
      createdAt: '2026-05-22T10:00:00.000Z',
    });
    const second = buildModelChangeLogEntry({
      id: 'second',
      irPath,
      source: 'mcp',
      reason: 'op_applied',
      before: after,
      after: { version: '1', types: after.types.slice(0, 1) },
      opKind: 'delete_type',
      createdAt: '2026-05-22T10:01:00.000Z',
    });

    await appendModelChangeLogEntry({ irPath, fs, entry: first, limit: 2 });
    await appendModelChangeLogEntry({ irPath, fs, entry: second, limit: 1 });

    const loaded = await loadModelChangeLog(irPath, fs);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.log.entries.map((entry) => entry.id)).toEqual(['second']);
    expect(fs.files.has(changeLogPathFor(irPath))).toBe(true);
  });

  it('returns warnings but keeps valid entries when the log is partially malformed', async () => {
    const entry = buildModelChangeLogEntry({
      id: 'valid',
      irPath,
      source: 'desktop',
      reason: 'op_applied',
      before,
      after,
      createdAt: '2026-05-22T10:00:00.000Z',
    });
    const fs = memFs({
      [changeLogPathFor(irPath)]: JSON.stringify({
        version: '1',
        entries: [entry, { id: 'broken' }],
      }),
    });

    const loaded = await loadModelChangeLog(irPath, fs);
    expect(loaded.log.entries.map((candidate) => candidate.id)).toEqual(['valid']);
    expect(loaded.warnings).toEqual(['1 change log entries could not be read.']);
  });

  it('prunes without mutating the original log', () => {
    const log = {
      version: '1' as const,
      entries: [
        buildModelChangeLogEntry({ id: 'a', irPath, source: 'cli', reason: 'op_applied', after }),
        buildModelChangeLogEntry({ id: 'b', irPath, source: 'cli', reason: 'op_applied', after }),
      ],
    };

    expect(pruneModelChangeLog(log, 1).entries.map((entry) => entry.id)).toEqual(['a']);
    expect(log.entries.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});
