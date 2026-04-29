import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileBackedForward, type FileBackedFs, type Schema } from '../src';

const initialSchema: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Post', table: true, fields: [] }],
};

describe('createFileBackedForward', () => {
  it('applies an op, writes the IR, and re-emits generated artefacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-core-'));
    const irPath = join(dir, 'packages/contexture/app.contexture.json');
    await mkdir(join(dir, 'packages/contexture'), { recursive: true });
    await writeFile(irPath, `${JSON.stringify(initialSchema, null, 2)}\n`, 'utf8');

    const forward = createFileBackedForward(irPath);
    const result = await forward({
      kind: 'add_field',
      typeName: 'Post',
      field: { name: 'title', type: { kind: 'string' } },
    });

    expect('schema' in result).toBe(true);
    const written = JSON.parse(await readFile(irPath, 'utf8')) as Schema;
    expect(written.types[0]).toMatchObject({
      kind: 'object',
      name: 'Post',
      fields: [{ name: 'title' }],
    });
    await expect(
      readFile(join(dir, 'packages/contexture/app.schema.ts'), 'utf8'),
    ).resolves.toContain('title');
    await expect(
      readFile(join(dir, 'packages/contexture/.contexture/emitted.json'), 'utf8'),
    ).resolves.toContain('app.schema.ts');
  });

  it('rolls back the IR if a later generated-file write fails', async () => {
    const irPath = '/proj/packages/contexture/app.contexture.json';
    const files = new Map<string, string>([
      [irPath, `${JSON.stringify(initialSchema, null, 2)}\n`],
    ]);
    const fs: FileBackedFs = {
      async readFile(path) {
        const value = files.get(path);
        if (value === undefined) {
          const err = new Error('missing') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        }
        return value;
      },
      async writeFile(path, content) {
        if (path.endsWith('app.schema.ts.tmp')) throw new Error('write failed');
        files.set(path, content);
      },
      async rename(from, to) {
        const value = files.get(from);
        if (value === undefined) throw new Error('missing tmp');
        files.set(to, value);
        files.delete(from);
      },
      async remove(path) {
        files.delete(path);
      },
      async mkdirp() {
        // no-op for the in-memory fake
      },
    };

    const forward = createFileBackedForward(irPath, fs);
    await expect(
      forward({
        kind: 'add_field',
        typeName: 'Post',
        field: { name: 'title', type: { kind: 'string' } },
      }),
    ).rejects.toThrow(/write failed/);

    expect(files.get(irPath)).toBe(`${JSON.stringify(initialSchema, null, 2)}\n`);
  });
});
