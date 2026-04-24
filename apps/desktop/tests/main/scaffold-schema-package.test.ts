/**
 * `scaffoldSchemaPackage` (stage 6) — lays down `packages/schema/`
 * with the initial IR, empty sidecars, a workspace package.json, a
 * `.gitignore`, and the `.contexture/` marker dir with empty
 * layout/chat/emitted stubs. Drives through MemFsAdapter so the
 * expected tree is easy to assert.
 */
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { scaffoldSchemaPackage } from '@main/scaffold/schema-package';
import { beforeEach, describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj' };
const schemaDir = '/work/my-proj/packages/schema';

let fs: ReturnType<typeof createMemFsAdapter>;

beforeEach(() => {
  fs = createMemFsAdapter();
});

describe('scaffoldSchemaPackage', () => {
  it('writes the initial IR file (empty schema)', async () => {
    await scaffoldSchemaPackage(config, { fs });
    const irPath = `${schemaDir}/my-proj.contexture.json`;
    expect(fs.exists(irPath)).toBe(true);
    const ir = JSON.parse(await fs.readFile(irPath));
    expect(ir).toEqual({ version: '1', types: [] });
  });

  it('writes the Zod bundle, JSON-schema mirror, and index barrel', async () => {
    await scaffoldSchemaPackage(config, { fs });
    expect(fs.exists(`${schemaDir}/my-proj.schema.ts`)).toBe(true);
    expect(fs.exists(`${schemaDir}/my-proj.schema.json`)).toBe(true);
    expect(fs.exists(`${schemaDir}/index.ts`)).toBe(true);
    const index = await fs.readFile(`${schemaDir}/index.ts`);
    expect(index).toContain(`export * from './my-proj.schema';`);
  });

  it('writes a workspace package.json with the @<project>/schema name', async () => {
    await scaffoldSchemaPackage(config, { fs });
    const pkg = JSON.parse(await fs.readFile(`${schemaDir}/package.json`));
    expect(pkg.name).toBe('@my-proj/schema');
    expect(pkg.private).toBe(true);
  });

  it('writes a .gitignore', async () => {
    await scaffoldSchemaPackage(config, { fs });
    expect(fs.exists(`${schemaDir}/.gitignore`)).toBe(true);
  });

  it('seeds an empty layout.json, chat.json, and emitted.json under .contexture/', async () => {
    await scaffoldSchemaPackage(config, { fs });
    expect(JSON.parse(await fs.readFile(`${schemaDir}/.contexture/layout.json`))).toEqual({
      version: '1',
      positions: {},
    });
    expect(JSON.parse(await fs.readFile(`${schemaDir}/.contexture/chat.json`))).toEqual({
      version: '1',
      messages: [],
    });
    expect(JSON.parse(await fs.readFile(`${schemaDir}/.contexture/emitted.json`))).toEqual({
      version: '1',
      files: {},
    });
  });
});
