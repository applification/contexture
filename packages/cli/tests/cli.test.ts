import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const cliPath = new URL('../src/index.ts', import.meta.url).pathname;

async function fixtureProject() {
  const dir = await mkdtemp(join(tmpdir(), 'contexture-cli-'));
  const irPath = join(dir, 'packages/contexture/app.contexture.json');
  const schema = {
    version: '1',
    types: [{ kind: 'object', name: 'Post', table: true, fields: [] }],
  };
  await mkdir(join(dir, 'packages/contexture'), { recursive: true });
  await writeFile(irPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  return { dir, irPath };
}

async function runCli(cwd: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
    const proc = spawn('bun', [cliPath, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

describe('@contexture/cli', () => {
  it('inspects schema as structured JSON', async () => {
    const { dir, irPath } = await fixtureProject();
    await writeFile(
      irPath,
      `${JSON.stringify({
        version: '1',
        metadata: { name: 'TestSchema' },
        types: [
          {
            kind: 'object',
            name: 'Post',
            table: true,
            fields: [
              { name: 'title', type: { kind: 'string' } },
              {
                name: 'tags',
                type: { kind: 'array', element: { kind: 'string' } },
                optional: true,
              },
            ],
          },
          { kind: 'enum', name: 'Status', values: [{ value: 'draft' }, { value: 'live' }] },
        ],
        imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      })}\n`,
    );

    const result = await runCli(dir, ['inspect', '--json']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      ok: true,
      version: '1',
      name: 'TestSchema',
      typeCount: 2,
      imports: [{ kind: 'stdlib', alias: 'common', path: '@contexture/common' }],
    });
    expect(parsed.types[0]).toMatchObject({
      name: 'Post',
      kind: 'object',
      table: true,
      fieldCount: 2,
      fields: [
        { name: 'title', type: 'string' },
        { name: 'tags', type: 'string[]', optional: true },
      ],
    });
    expect(parsed.types[1]).toMatchObject({
      name: 'Status',
      kind: 'enum',
      values: ['draft', 'live'],
    });
  });

  it('inspects schema as human-readable text', async () => {
    const { dir } = await fixtureProject();
    const result = await runCli(dir, ['inspect']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Types: 1');
    expect(result.stdout).toContain('Objects:');
    expect(result.stdout).toContain('Post [table]');
  });

  it('lists types as structured JSON', async () => {
    const { dir } = await fixtureProject();
    const result = await runCli(dir, ['list-types', '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      types: [{ name: 'Post', kind: 'object', table: true }],
    });
  });

  it('returns get-type misses as structured JSON errors', async () => {
    const { dir } = await fixtureProject();
    const result = await runCli(dir, ['get-type', 'Nope', '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { message: 'type "Nope" not found', code: 'CLI_ERROR' },
    });
  });

  it('returns validation issues as structured JSON', async () => {
    const { dir, irPath } = await fixtureProject();
    await writeFile(irPath, `${JSON.stringify({ version: '1', types: [{ name: '' }] })}\n`);

    const result = await runCli(dir, ['validate', '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      errors: [{ message: expect.any(String) }],
    });
  });

  it('adds a field and re-emits generated files', async () => {
    const { dir, irPath } = await fixtureProject();
    const result = await runCli(dir, ['add-field', 'Post', 'title', '{"kind":"string"}', '--json']);
    expect(result.exitCode).toBe(0);

    const ir = JSON.parse(await readFile(irPath, 'utf8'));
    expect(ir.types[0].fields).toEqual([{ name: 'title', type: { kind: 'string' } }]);
    await expect(
      readFile(join(dir, 'packages/contexture/convex/schema.ts'), 'utf8'),
    ).resolves.toContain('title');
  });

  it('exits non-zero with JSON when an op fails', async () => {
    const { dir } = await fixtureProject();
    const result = await runCli(dir, ['delete-field', 'Post', 'missing', '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: 'APPLY_FAILED' },
    });
  });
});
