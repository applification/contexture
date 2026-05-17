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

async function fixtureScratch() {
  const dir = await mkdtemp(join(tmpdir(), 'contexture-cli-scratch-'));
  const irPath = join(dir, 'scratch.contexture.json');
  const schema = {
    version: '1',
    types: [{ kind: 'object', name: 'Note', fields: [] }],
  };
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

  it('allows read-only inspection of scratch .contexture.json files', async () => {
    const { dir, irPath } = await fixtureScratch();
    const result = await runCli(dir, ['inspect', '--ir', irPath, '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      path: irPath,
      types: [expect.objectContaining({ name: 'Note' })],
    });
  });

  it('rejects non-.contexture.json IR paths before reading or writing', async () => {
    const { dir } = await fixtureProject();
    const badPath = join(dir, 'packages/contexture/app.schema.json');
    await writeFile(badPath, '{}\n', 'utf8');

    const result = await runCli(dir, ['inspect', '--ir', badPath, '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('Expected a .contexture.json path') },
    });
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

  it('returns semantic validation issues as structured JSON', async () => {
    const { dir, irPath } = await fixtureProject();
    await writeFile(
      irPath,
      `${JSON.stringify({
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Order',
            fields: [{ name: 'buyer', type: { kind: 'ref', typeName: 'Buyer' } }],
          },
          { kind: 'enum', name: 'Status', values: [] },
        ],
      })}\n`,
    );

    const result = await runCli(dir, ['validate', '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      errors: [
        expect.objectContaining({ code: 'unresolved_ref', path: 'types.0.fields.0.type' }),
        expect.objectContaining({ code: 'enum_empty', path: 'types.1.values' }),
      ],
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

  it('check-generated reports stale files when nothing is emitted', async () => {
    const { dir } = await fixtureProject();
    const result = await runCli(dir, ['check-generated', '--json']);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.checked).toBeGreaterThan(0);
    expect(parsed.files.every((entry: { status: string }) => entry.status === 'unreadable')).toBe(
      true,
    );
    expect(parsed.drift.every((entry: { status: string }) => entry.status === 'unreadable')).toBe(
      true,
    );
    expect(Array.isArray(parsed.stale)).toBe(true);
    expect(parsed.stale.length).toBeGreaterThan(0);
    for (const entry of parsed.stale) {
      expect(entry).toMatchObject({ reason: 'missing', status: 'unreadable' });
    }
  });

  it('check-generated passes after emit', async () => {
    const { dir } = await fixtureProject();
    const emitResult = await runCli(dir, ['emit', '--json']);
    expect(emitResult.exitCode).toBe(0);

    const checkResult = await runCli(dir, ['check-generated', '--json']);
    expect(checkResult.exitCode).toBe(0);
    expect(JSON.parse(checkResult.stdout)).toMatchObject({
      ok: true,
      message: expect.stringContaining('up to date'),
      files: expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('packages/contexture/convex/schema.ts'),
          status: 'clean',
        }),
      ]),
    });
  });

  it('rejects generated-output commands for scratch IR paths', async () => {
    const { dir, irPath } = await fixtureScratch();
    const result = await runCli(dir, ['emit', '--ir', irPath, '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('packages/contexture/*.contexture.json') },
    });
  });

  it('check-generated detects drift after manual edits', async () => {
    const { dir } = await fixtureProject();
    await runCli(dir, ['emit', '--json']);
    const convexPath = join(dir, 'packages/contexture/convex/schema.ts');
    const current = await readFile(convexPath, 'utf8');
    await writeFile(convexPath, `${current}\n// drifted\n`, 'utf8');

    const result = await runCli(dir, ['check-generated', '--json']);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('packages/contexture/convex/schema.ts'),
          status: 'drifted',
        }),
      ]),
    );
    expect(parsed.drift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('packages/contexture/convex/schema.ts'),
          status: 'drifted',
        }),
      ]),
    );
    expect(
      parsed.stale.some(
        (s: { path: string; reason: string; status: string }) =>
          s.path.endsWith('convex/schema.ts') && s.reason === 'mismatch' && s.status === 'drifted',
      ),
    ).toBe(true);
  });

  it('check-generated detects stale emitted manifest files', async () => {
    const { dir } = await fixtureProject();
    await runCli(dir, ['emit', '--json']);
    const emittedPath = join(dir, 'packages/contexture/.contexture/emitted.json');
    await writeFile(emittedPath, `${JSON.stringify({ version: '1', files: {} }, null, 2)}\n`);

    const result = await runCli(dir, ['check-generated', '--json']);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('packages/contexture/.contexture/emitted.json'),
          status: 'drifted',
        }),
      ]),
    );
    expect(parsed.stale).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('packages/contexture/.contexture/emitted.json'),
          reason: 'mismatch',
        }),
      ]),
    );
  });

  it('apply --op-json applies a serialized op', async () => {
    const { dir, irPath } = await fixtureProject();
    const op = JSON.stringify({
      kind: 'add_field',
      typeName: 'Post',
      field: { name: 'title', type: { kind: 'string' } },
    });
    const result = await runCli(dir, ['apply', '--op-json', op, '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      message: 'add_field applied.',
    });
    const ir = JSON.parse(await readFile(irPath, 'utf8'));
    expect(ir.types[0].fields).toEqual([{ name: 'title', type: { kind: 'string' } }]);
  });

  it('apply --op-file reads the op from disk', async () => {
    const { dir, irPath } = await fixtureProject();
    const opPath = join(dir, 'op.json');
    await writeFile(
      opPath,
      JSON.stringify({
        kind: 'add_field',
        typeName: 'Post',
        field: { name: 'body', type: { kind: 'string' } },
      }),
    );
    const result = await runCli(dir, ['apply', '--op-file', opPath, '--json']);
    expect(result.exitCode).toBe(0);
    const ir = JSON.parse(await readFile(irPath, 'utf8'));
    expect(ir.types[0].fields).toEqual([{ name: 'body', type: { kind: 'string' } }]);
  });

  it('apply rejects ops with semantic errors', async () => {
    const { dir } = await fixtureProject();
    const op = JSON.stringify({ kind: 'remove_field', typeName: 'Post', fieldName: 'nope' });
    const result = await runCli(dir, ['apply', '--op-json', op, '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: 'APPLY_FAILED' },
    });
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
