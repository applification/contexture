/**
 * `scaffoldSchemaPackage` (stage 6) — lays down `packages/contexture/`
 * with the initial IR, empty sidecars, a workspace package.json, a
 * `.gitignore`, and the `.contexture/` marker dir with empty
 * layout/chat/emitted stubs. Drives through MemFsAdapter so the
 * expected tree is easy to assert.
 */
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { scaffoldSchemaPackage } from '@main/scaffold/schema-package';
import { beforeEach, describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj', apps: ['web'] as const };
const schemaDir = '/work/my-proj/packages/contexture';

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

  it('writes a workspace package.json with the @<project>/contexture name', async () => {
    await scaffoldSchemaPackage(config, { fs });
    const pkg = JSON.parse(await fs.readFile(`${schemaDir}/package.json`));
    expect(pkg.name).toBe('@my-proj/contexture');
    expect(pkg.private).toBe(true);
  });

  it('writes a .gitignore', async () => {
    await scaffoldSchemaPackage(config, { fs });
    expect(fs.exists(`${schemaDir}/.gitignore`)).toBe(true);
  });

  it('seeds an empty chat.json when no description is provided', async () => {
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

  it('seeds chat.json with the description as the first user message when provided', async () => {
    const withDesc = { ...config, description: 'A photo-sharing app' };
    await scaffoldSchemaPackage(withDesc, { fs });
    const chat = JSON.parse(await fs.readFile(`${schemaDir}/.contexture/chat.json`));
    expect(chat.version).toBe('1');
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0].role).toBe('user');
    expect(chat.messages[0].content).toBe('A photo-sharing app');
    expect(typeof chat.messages[0].id).toBe('string');
    expect(typeof chat.messages[0].createdAt).toBe('number');
  });

  it('trims whitespace from the description before seeding', async () => {
    const withDesc = { ...config, description: '  A blog platform  ' };
    await scaffoldSchemaPackage(withDesc, { fs });
    const chat = JSON.parse(await fs.readFile(`${schemaDir}/.contexture/chat.json`));
    expect(chat.messages[0].content).toBe('A blog platform');
  });

  it('uses scratch IR content instead of empty schema when scratchPath is provided', async () => {
    const scratchIr = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [{ name: 'title', type: { kind: 'string' } }],
          table: true,
        },
      ],
    };
    const seededFs = createMemFsAdapter({
      '/scratch/post.contexture.json': `${JSON.stringify(scratchIr, null, 2)}\n`,
    });
    const withScratch = { ...config, scratchPath: '/scratch/post.contexture.json' };
    await scaffoldSchemaPackage(withScratch, { fs: seededFs });

    const irPath = `${schemaDir}/my-proj.contexture.json`;
    const written = JSON.parse(await seededFs.readFile(irPath));
    expect(written.types).toHaveLength(1);
    expect(written.types[0].name).toBe('Post');
  });

  it('emits Zod and JSON mirrors from the promoted IR', async () => {
    const scratchIr = {
      version: '1',
      types: [
        { kind: 'object', name: 'User', fields: [{ name: 'email', type: { kind: 'string' } }] },
      ],
    };
    const seededFs = createMemFsAdapter({
      '/scratch/user.contexture.json': `${JSON.stringify(scratchIr, null, 2)}\n`,
    });
    const withScratch = { ...config, scratchPath: '/scratch/user.contexture.json' };
    await scaffoldSchemaPackage(withScratch, { fs: seededFs });

    const schemaTsPath = `${schemaDir}/my-proj.schema.ts`;
    const schemaTs = await seededFs.readFile(schemaTsPath);
    expect(schemaTs).toContain('User');
  });
});
