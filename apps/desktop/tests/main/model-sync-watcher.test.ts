import {
  buildModelChangeLogEntry,
  changeLogPathFor,
  hashContent,
  type Schema,
  save,
} from '@contexture/core';
import { createModelSyncWatcher, type ModelSyncEvent } from '@main/documents/model-sync-watcher';
import { describe, expect, it, vi } from 'vitest';

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
  ],
};

function readFrom(files: Map<string, string>) {
  return async (path: string): Promise<string> => {
    const content = files.get(path);
    if (content === undefined) {
      const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    return content;
  };
}

describe('createModelSyncWatcher', () => {
  it('emits valid external IR changes', async () => {
    const files = new Map([[irPath, `${save(after)}\n`]]);
    const onEvent = vi.fn<(event: ModelSyncEvent) => void>();
    const watcher = createModelSyncWatcher({ irPath, readFile: readFrom(files), onEvent });

    await watcher.check();

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        irPath,
        status: 'changed',
        source: 'external',
        schema: after,
      }),
    );
  });

  it('suppresses acknowledged self-writes', async () => {
    const raw = `${save(after)}\n`;
    const files = new Map([[irPath, raw]]);
    const onEvent = vi.fn<(event: ModelSyncEvent) => void>();
    const watcher = createModelSyncWatcher({ irPath, readFile: readFrom(files), onEvent });

    watcher.acknowledgeSelfWrite(hashContent(raw));
    await watcher.check();

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('reports invalid JSON without throwing', async () => {
    const files = new Map([[irPath, '{not json']]);
    const onEvent = vi.fn<(event: ModelSyncEvent) => void>();
    const watcher = createModelSyncWatcher({ irPath, readFile: readFrom(files), onEvent });

    await watcher.check();

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'invalid_json',
        source: 'external',
        error: expect.stringContaining('Invalid JSON'),
      }),
    );
  });

  it('uses change-log entries to attribute the source', async () => {
    const entry = buildModelChangeLogEntry({
      id: 'mcp-change',
      irPath,
      source: 'mcp',
      reason: 'op_applied',
      before,
      after,
      opKind: 'add_field',
    });
    const files = new Map([
      [irPath, `${save(after)}\n`],
      [changeLogPathFor(irPath), JSON.stringify({ version: '1', entries: [entry] })],
    ]);
    const onEvent = vi.fn<(event: ModelSyncEvent) => void>();
    const watcher = createModelSyncWatcher({ irPath, readFile: readFrom(files), onEvent });

    await watcher.check();

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'changed',
        source: 'mcp',
        change: expect.objectContaining({ id: 'mcp-change', opKind: 'add_field' }),
      }),
    );
  });
});
