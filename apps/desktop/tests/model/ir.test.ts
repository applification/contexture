import { IRSchema } from '@renderer/model/ir';
import { describe, expect, it } from 'vitest';

describe('IRSchema', () => {
  it('accepts a minimal empty schema', () => {
    const input = { version: '1', types: [] };
    const parsed = IRSchema.parse(input);
    expect(parsed.version).toBe('1');
    expect(parsed.types).toEqual([]);
  });

  it('accepts string field constraints', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [
            {
              name: 'email',
              type: { kind: 'string', min: 3, max: 255, format: 'email' },
            },
          ],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    const td = parsed.types[0];
    if (td.kind !== 'object') throw new Error('expected object');
    expect(td.fields[0].type).toEqual({ kind: 'string', min: 3, max: 255, format: 'email' });
  });

  it('accepts number, boolean, date, and literal field types', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Mixed',
          fields: [
            { name: 'age', type: { kind: 'number', min: 0, max: 150, int: true } },
            { name: 'active', type: { kind: 'boolean' } },
            { name: 'created', type: { kind: 'date' } },
            { name: 'tag', type: { kind: 'literal', value: 'admin' } },
            { name: 'n', type: { kind: 'literal', value: 42 } },
            { name: 'b', type: { kind: 'literal', value: true } },
          ],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    const td = parsed.types[0];
    if (td.kind !== 'object') throw new Error('expected object');
    expect(td.fields.map((f) => f.type.kind)).toEqual([
      'number',
      'boolean',
      'date',
      'literal',
      'literal',
      'literal',
    ]);
  });

  it('accepts ref field types with qualified names', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Contact',
          fields: [
            { name: 'primary', type: { kind: 'ref', typeName: 'common.Email' } },
            { name: 'self', type: { kind: 'ref', typeName: 'Address' } },
          ],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    const td = parsed.types[0];
    if (td.kind !== 'object') throw new Error('expected object');
    expect(td.fields[0].type).toEqual({ kind: 'ref', typeName: 'common.Email' });
    expect(td.fields[1].type).toEqual({ kind: 'ref', typeName: 'Address' });
  });

  it('accepts array field types recursively', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Bag',
          fields: [
            {
              name: 'tags',
              type: { kind: 'array', element: { kind: 'string' }, min: 1 },
            },
            {
              name: 'matrix',
              type: {
                kind: 'array',
                element: { kind: 'array', element: { kind: 'number' } },
              },
            },
          ],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    const td = parsed.types[0];
    if (td.kind !== 'object') throw new Error('expected object');
    expect(td.fields[0].type.kind).toBe('array');
    const nested = td.fields[1].type;
    if (nested.kind !== 'array') throw new Error('expected array');
    expect(nested.element.kind).toBe('array');
  });

  it('accepts FieldDef optional/nullable/default/description', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Opts',
          fields: [
            {
              name: 'nickname',
              description: 'display handle',
              type: { kind: 'string' },
              optional: true,
              nullable: true,
              default: 'anon',
            },
          ],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    const td = parsed.types[0];
    if (td.kind !== 'object') throw new Error('expected object');
    expect(td.fields[0]).toMatchObject({
      name: 'nickname',
      description: 'display handle',
      optional: true,
      nullable: true,
      default: 'anon',
    });
  });

  it('accepts enum TypeDef', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'enum',
          name: 'Role',
          values: [{ value: 'admin', description: 'Full access' }, { value: 'member' }],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    expect(parsed.types[0]).toMatchObject({ kind: 'enum', name: 'Role' });
  });

  it('accepts discriminatedUnion TypeDef', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['ClickEvent', 'HoverEvent'],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    expect(parsed.types[0]).toMatchObject({
      kind: 'discriminatedUnion',
      discriminator: 'type',
      variants: ['ClickEvent', 'HoverEvent'],
    });
  });

  it('accepts raw TypeDef with optional import hint', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'raw',
          name: 'Money',
          zod: 'z.object({ amount: z.number(), currency: z.string() })',
          jsonSchema: { type: 'object' },
          import: { from: '@contexture/common', name: 'Money' },
        },
        {
          kind: 'raw',
          name: 'Bare',
          zod: 'z.unknown()',
          jsonSchema: {},
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    expect(parsed.types[0]).toMatchObject({ kind: 'raw', name: 'Money' });
    expect(parsed.types[1]).toMatchObject({ kind: 'raw', name: 'Bare' });
  });

  it('accepts imports (stdlib and relative) and metadata', () => {
    const input = {
      version: '1',
      metadata: { name: 'Blog', description: 'Sample domain' },
      imports: [
        { kind: 'stdlib', path: '@contexture/common', alias: 'common' },
        { kind: 'relative', path: './shared.contexture.json', alias: 'shared' },
      ],
      types: [],
    };
    const parsed = IRSchema.parse(input);
    expect(parsed.imports).toHaveLength(2);
    expect(parsed.imports?.[0]).toMatchObject({ kind: 'stdlib', alias: 'common' });
    expect(parsed.metadata).toEqual({ name: 'Blog', description: 'Sample domain' });
  });

  it('rejects stdlib imports whose path does not begin with @contexture/', () => {
    const input = {
      version: '1',
      imports: [{ kind: 'stdlib', path: 'not-a-contexture-path', alias: 'x' }],
      types: [],
    };
    const res = IRSchema.safeParse(input);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues.some((i) => i.path.join('.').includes('imports'))).toBe(true);
  });

  it('rejects a schema missing the version tag', () => {
    const res = IRSchema.safeParse({ types: [] });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues.some((i) => i.path.join('.') === 'version')).toBe(true);
  });

  it('rejects a TypeDef with an unknown kind and reports the path', () => {
    const input = {
      version: '1',
      types: [{ kind: 'interface', name: 'Nope' }],
    };
    const res = IRSchema.safeParse(input);
    expect(res.success).toBe(false);
    if (res.success) return;
    const issue = res.error.issues.find((i) => i.path.join('.').startsWith('types.0'));
    expect(issue).toBeDefined();
  });

  it('rejects a FieldType with an unknown kind and reports the path', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [{ name: 'mystery', type: { kind: 'bigint' } }],
        },
      ],
    };
    const res = IRSchema.safeParse(input);
    expect(res.success).toBe(false);
    if (res.success) return;
    const path = res.error.issues[0]?.path.join('.');
    expect(path).toContain('types.0.fields.0.type');
  });

  it('accepts an object TypeDef with table:true and indexes', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          indexes: [
            { name: 'by_author', fields: ['author'] },
            { name: 'by_author_and_date', fields: ['author', 'publishedAt'] },
          ],
          fields: [
            { name: 'author', type: { kind: 'string' } },
            { name: 'publishedAt', type: { kind: 'date' } },
          ],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    const td = parsed.types[0];
    if (td.kind !== 'object') throw new Error('expected object');
    expect(td.table).toBe(true);
    expect(td.indexes).toEqual([
      { name: 'by_author', fields: ['author'] },
      { name: 'by_author_and_date', fields: ['author', 'publishedAt'] },
    ]);
  });

  it('rejects an index with an empty fields array', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          indexes: [{ name: 'bad', fields: [] }],
          fields: [{ name: 'author', type: { kind: 'string' } }],
        },
      ],
    };
    const res = IRSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  it('accepts an object TypeDef with a string field', () => {
    const input = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [{ name: 'name', type: { kind: 'string' } }],
        },
      ],
    };
    const parsed = IRSchema.parse(input);
    expect(parsed.types[0]).toMatchObject({ kind: 'object', name: 'User' });
  });
});
