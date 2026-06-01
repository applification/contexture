import { describe, expect, it } from 'vitest';
import {
  checkGeneratedBundle,
  classifyGeneratedBundleDrift,
  GeneratedBundleDriftError,
  type GeneratedBundleFs,
  type Schema,
  writeGeneratedBundle,
} from '../src';

const irPath = '/proj/packages/contexture/app.contexture.json';

const schema: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Post', table: true, fields: [] }],
};

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

function createFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  let failPattern: RegExp | null = null;

  const fs: GeneratedBundleFs & {
    files: Map<string, string>;
    failWritesMatching(pattern: RegExp): void;
    tmpFiles(): string[];
  } = {
    files,
    async readFile(path) {
      const value = files.get(path);
      if (value === undefined) throw enoent(path);
      return value;
    },
    async writeFile(path, content) {
      if (failPattern?.test(path)) throw new Error(`write failed: ${path}`);
      files.set(path, content);
    },
    async rename(from, to) {
      const value = files.get(from);
      if (value === undefined) throw enoent(from);
      files.set(to, value);
      files.delete(from);
    },
    async remove(path) {
      files.delete(path);
    },
    async mkdirp() {
      // The in-memory fake has implicit directories.
    },
    failWritesMatching(pattern) {
      failPattern = pattern;
    },
    tmpFiles() {
      return [...files.keys()].filter((path) => path.endsWith('.tmp'));
    },
  };

  return fs;
}

describe('generated bundle writer', () => {
  it('writes the IR, generated artefacts, and manifest atomically', async () => {
    const fs = createFs();

    const result = await writeGeneratedBundle({ irPath, schema, fs });

    expect(fs.files.get(irPath)).toContain('"Post"');
    expect(fs.files.get('/proj/packages/contexture/app.schema.ts')).toContain(
      '@contexture-generated',
    );
    expect(fs.files.get('/proj/packages/contexture/.contexture/emitted.json')).toContain(
      'app.schema.ts',
    );
    expect(result.emitted.map((file) => file.path).sort()).toEqual(
      [
        '/proj/packages/contexture/app.schema.json',
        '/proj/packages/contexture/app.schema.ts',
        '/proj/packages/contexture/convex/schema.ts',
        '/proj/packages/contexture/convex/validators.ts',
        '/proj/packages/contexture/index.ts',
      ].sort(),
    );
  });

  it('rolls back prior writes when a later generated artefact fails', async () => {
    const original = `${JSON.stringify(schema, null, 2)}\n`;
    const fs = createFs({ [irPath]: original });
    fs.failWritesMatching(/app\.schema\.ts\.tmp$/);

    await expect(
      writeGeneratedBundle({
        irPath,
        schema: {
          version: '1',
          types: [{ kind: 'object', name: 'Changed', table: true, fields: [] }],
        },
        fs,
      }),
    ).rejects.toThrow(/write failed/);

    expect(fs.files.get(irPath)).toBe(original);
    expect(fs.tmpFiles()).toEqual([]);
  });

  it('preflights against the last manifest before overwriting generated files', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });
    await fs.writeFile('/proj/packages/contexture/app.schema.ts', '// hand edit\n');

    await expect(
      writeGeneratedBundle({
        irPath,
        schema: {
          version: '1',
          types: [
            {
              kind: 'object',
              name: 'Post',
              table: true,
              fields: [{ name: 'title', type: { kind: 'string' } }],
            },
          ],
        },
        fs,
      }),
    ).rejects.toBeInstanceOf(GeneratedBundleDriftError);

    expect(fs.files.get('/proj/packages/contexture/app.schema.ts')).toBe('// hand edit\n');
  });

  it('allows save to recreate generated files missing from the last manifest', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });
    await fs.remove('/proj/packages/contexture/app.schema.ts');

    await writeGeneratedBundle({
      irPath,
      schema: {
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Post',
            table: true,
            fields: [{ name: 'title', type: { kind: 'string' } }],
          },
        ],
      },
      fs,
    });

    expect(fs.files.get('/proj/packages/contexture/app.schema.ts')).toContain(
      '@contexture-generated',
    );
    expect(fs.files.get(irPath)).toContain('"title"');
  });

  it('accepts a manifest written from a different absolute checkout root', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });
    const manifest = JSON.parse(
      fs.files.get('/proj/packages/contexture/.contexture/emitted.json') ?? '{}',
    ) as { files: Record<string, string> };
    await fs.writeFile(
      '/proj/packages/contexture/.contexture/emitted.json',
      `${JSON.stringify(
        {
          version: '1',
          files: Object.fromEntries(
            Object.entries(manifest.files).map(([key, hash]) => [
              `/Users/rufus/Apps/plantry/${key}`,
              hash,
            ]),
          ),
        },
        null,
        2,
      )}\n`,
    );

    const checks = await classifyGeneratedBundleDrift(schema, irPath, fs);

    expect(checks.every((check) => check.status === 'clean')).toBe(true);
  });

  it('allows explicit re-emits to overwrite generated drift', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });
    await fs.writeFile('/proj/packages/contexture/app.schema.ts', '// hand edit\n');

    await writeGeneratedBundle({ irPath, schema, fs, driftPreflight: false });

    expect(fs.files.get('/proj/packages/contexture/app.schema.ts')).toContain(
      '@contexture-generated',
    );
  });

  it('can preflight generated target collisions before initializing a bundle', async () => {
    const fs = createFs({ '/proj/packages/contexture/app.schema.ts': '// hand edit\n' });

    await expect(
      writeGeneratedBundle({
        irPath,
        schema,
        fs,
        driftPreflight: false,
        generatedTargetPreflight: true,
      }),
    ).rejects.toBeInstanceOf(GeneratedBundleDriftError);

    expect(fs.files.get('/proj/packages/contexture/app.schema.ts')).toBe('// hand edit\n');
  });

  it('allows generated target preflight when existing bytes already match', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });
    const schemaTs = fs.files.get('/proj/packages/contexture/app.schema.ts');

    await writeGeneratedBundle({
      irPath,
      schema,
      fs,
      driftPreflight: false,
      generatedTargetPreflight: true,
    });

    expect(fs.files.get('/proj/packages/contexture/app.schema.ts')).toBe(schemaTs);
  });

  it('checks generated files through the same expected bundle shape', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });
    await fs.writeFile('/proj/packages/contexture/app.schema.json', '{}\n');

    const checks = await checkGeneratedBundle(schema, irPath, fs);

    expect(checks.find((check) => check.path.endsWith('app.schema.json'))).toEqual({
      path: '/proj/packages/contexture/app.schema.json',
      status: 'drifted',
    });
    expect(checks.find((check) => check.path.endsWith('app.schema.ts'))?.status).toBe('clean');
  });

  it('classifies files that still match the manifest but not the current IR as stale', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });

    const checks = await classifyGeneratedBundleDrift(
      {
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Post',
            table: true,
            fields: [{ name: 'title', type: { kind: 'string' } }],
          },
        ],
      },
      irPath,
      fs,
    );

    expect(checks.find((check) => check.path.endsWith('convex/schema.ts'))).toMatchObject({
      status: 'stale',
      matchesManifest: true,
      matchesCurrentIr: false,
    });
  });

  it('classifies files that match the current IR but not the manifest as externally regenerated', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });
    const oldManifest = fs.files.get('/proj/packages/contexture/.contexture/emitted.json');
    expect(oldManifest).toBeDefined();

    const nextSchema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
      ],
    };
    await writeGeneratedBundle({ irPath, schema: nextSchema, fs, driftPreflight: false });
    await fs.writeFile('/proj/packages/contexture/.contexture/emitted.json', oldManifest ?? '');

    const checks = await classifyGeneratedBundleDrift(nextSchema, irPath, fs);

    expect(checks.find((check) => check.path.endsWith('convex/schema.ts'))).toMatchObject({
      status: 'externally_regenerated',
      matchesManifest: false,
      matchesCurrentIr: true,
    });
  });

  it('classifies missing and hand-modified generated files separately', async () => {
    const fs = createFs();
    await writeGeneratedBundle({ irPath, schema, fs });
    await fs.remove('/proj/packages/contexture/convex/validators.ts');
    await fs.writeFile('/proj/packages/contexture/convex/schema.ts', '// hand edit\n');

    const checks = await classifyGeneratedBundleDrift(schema, irPath, fs);

    expect(checks.find((check) => check.path.endsWith('convex/validators.ts'))).toMatchObject({
      status: 'missing',
      matchesManifest: false,
      matchesCurrentIr: false,
    });
    expect(checks.find((check) => check.path.endsWith('convex/schema.ts'))).toMatchObject({
      status: 'modified',
      matchesManifest: false,
      matchesCurrentIr: false,
    });
  });
});
