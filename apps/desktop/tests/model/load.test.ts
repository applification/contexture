import { load, save } from '@renderer/model/load';
import type { Migration } from '@renderer/model/migrations';
import { describe, expect, it } from 'vitest';

describe('load', () => {
  it('parses a valid v1 IR and returns it with no warnings', () => {
    const raw = JSON.stringify({ version: '1', types: [] });
    const { schema, warnings } = load(raw);
    expect(schema.version).toBe('1');
    expect(schema.types).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('rejects malformed JSON with a clear load-time error', () => {
    let err: unknown;
    try {
      load('{ not json');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/invalid json/i);
  });

  it('rejects malformed IR with a Zod error carrying the offending path', () => {
    const raw = JSON.stringify({
      version: '1',
      types: [{ kind: 'object', name: 'X', fields: [{ name: 'f', type: { kind: 'bigint' } }] }],
    });
    let err: unknown;
    try {
      load(raw);
    } catch (e) {
      err = e;
    }
    // ZodError has an `issues` array with `.path`
    const issues = (err as { issues?: Array<{ path: (string | number)[] }> }).issues;
    expect(issues).toBeDefined();
    expect(issues?.[0]?.path.join('.')).toContain('types.0.fields.0.type');
  });

  it('rejects an unknown version with a message naming the version', () => {
    const raw = JSON.stringify({ version: '999', types: [] });
    expect(() => load(raw)).toThrow(/999/);
  });

  it('applies a registered v0→v1 migration and reports a warning', () => {
    // Fictional v0 shape: `entities` instead of `types`.
    const v0: { version: string; entities: unknown[] } = { version: '0', entities: [] };
    const migration: Migration = {
      from: '0',
      to: '1',
      migrate: (input) => {
        const { entities, ...rest } = input as { entities: unknown[] };
        return { ...rest, version: '1', types: entities };
      },
      warning: 'Upgraded schema from v0 to v1.',
    };
    const { schema, warnings } = load(JSON.stringify(v0), [migration]);
    expect(schema.version).toBe('1');
    expect(schema.types).toEqual([]);
    expect(warnings).toEqual(['Upgraded schema from v0 to v1.']);
  });

  it('walks a multi-step migration chain in order', () => {
    const order: string[] = [];
    const chain: Migration[] = [
      {
        from: '0',
        to: '0.5',
        migrate: (input) => {
          order.push('0→0.5');
          return { ...(input as object), version: '0.5' };
        },
        warning: 'step1',
      },
      {
        from: '0.5',
        to: '1',
        migrate: (input) => {
          order.push('0.5→1');
          return { ...(input as object), version: '1' };
        },
        warning: 'step2',
      },
    ];
    const v0 = JSON.stringify({ version: '0', types: [] });
    const { warnings } = load(v0, chain);
    expect(order).toEqual(['0→0.5', '0.5→1']);
    expect(warnings).toEqual(['step1', 'step2']);
  });

  it('round-trips a non-trivial v1 schema through save/load', () => {
    const original: import('@renderer/model/types').Schema = {
      version: '1',
      metadata: { name: 'Blog', description: 'Demo' },
      imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [
            { name: 'title', type: { kind: 'string', min: 1, max: 120 } },
            { name: 'author', type: { kind: 'ref', typeName: 'common.Email' } },
            {
              name: 'tags',
              optional: true,
              type: { kind: 'array', element: { kind: 'string' } },
            },
          ],
        },
      ],
    };
    const { schema } = load(save(original));
    expect(schema).toEqual(original);
  });
});
