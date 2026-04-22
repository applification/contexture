import type { Schema } from '@renderer/model/types';
import { apply } from '@renderer/store/ops';
import { describe, expect, it } from 'vitest';

const empty: Schema = { version: '1', types: [] };

function ok(res: ReturnType<typeof apply>): Schema {
  if ('error' in res) throw new Error(`expected ok, got error: ${res.error}`);
  return res.schema;
}

describe('apply', () => {
  it('returns an error for an unknown op kind', () => {
    // biome-ignore lint/suspicious/noExplicitAny: invalid kind by design
    const res = apply(empty, { kind: 'nope' } as any);
    expect('error' in res).toBe(true);
  });

  // 1. add_type
  it('add_type: appends a new type and rejects duplicate names', () => {
    const s1 = ok(
      apply(empty, { kind: 'add_type', type: { kind: 'object', name: 'User', fields: [] } }),
    );
    expect(s1.types).toHaveLength(1);
    const dup = apply(s1, { kind: 'add_type', type: { kind: 'object', name: 'User', fields: [] } });
    expect('error' in dup && dup.error).toMatch(/User/);
  });

  // 2. update_type
  it('update_type: merges a description onto an existing type', () => {
    const s1 = ok(
      apply(empty, { kind: 'add_type', type: { kind: 'object', name: 'User', fields: [] } }),
    );
    const s2 = ok(
      apply(s1, { kind: 'update_type', name: 'User', patch: { description: 'A user' } }),
    );
    expect(s2.types[0]).toEqual({
      kind: 'object',
      name: 'User',
      fields: [],
      description: 'A user',
    });
  });

  // 3. rename_type (basic)
  it('rename_type: renames in place and fails if target name already exists', () => {
    const s1: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'User', fields: [] },
        { kind: 'object', name: 'Post', fields: [] },
      ],
    };
    const s2 = ok(apply(s1, { kind: 'rename_type', from: 'User', to: 'Author' }));
    expect(s2.types.map((t) => t.name)).toEqual(['Author', 'Post']);
    const clash = apply(s2, { kind: 'rename_type', from: 'Author', to: 'Post' });
    expect('error' in clash).toBe(true);
  });

  // rename cascade
  it('rename_type: cascades through refs, array elements, and discriminated-union variants', () => {
    const s1: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Author', fields: [] },
        {
          kind: 'object',
          name: 'Post',
          fields: [{ name: 'by', type: { kind: 'ref', typeName: 'Author' } }],
        },
        {
          kind: 'object',
          name: 'Draft',
          fields: [
            {
              name: 'authors',
              type: { kind: 'array', element: { kind: 'ref', typeName: 'Author' } },
            },
          ],
        },
        {
          kind: 'discriminatedUnion',
          name: 'Contributor',
          discriminator: 'type',
          variants: ['Author'],
        },
      ],
    };
    const s2 = ok(apply(s1, { kind: 'rename_type', from: 'Author', to: 'Writer' }));
    expect(s2.types[0].name).toBe('Writer');
    const post = s2.types[1] as Extract<(typeof s2.types)[number], { kind: 'object' }>;
    expect(post.fields[0].type).toEqual({ kind: 'ref', typeName: 'Writer' });
    const draft = s2.types[2] as Extract<(typeof s2.types)[number], { kind: 'object' }>;
    expect(draft.fields[0].type).toEqual({
      kind: 'array',
      element: { kind: 'ref', typeName: 'Writer' },
    });
    const dunion = s2.types[3] as Extract<
      (typeof s2.types)[number],
      { kind: 'discriminatedUnion' }
    >;
    expect(dunion.variants).toEqual(['Writer']);
  });

  // rename does NOT touch qualified refs
  it('rename_type: leaves qualified (alias.Name) refs alone', () => {
    const s1: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      types: [
        { kind: 'object', name: 'Author', fields: [] },
        {
          kind: 'object',
          name: 'Contact',
          fields: [{ name: 'email', type: { kind: 'ref', typeName: 'common.Author' } }],
        },
      ],
    };
    const s2 = ok(apply(s1, { kind: 'rename_type', from: 'Author', to: 'Writer' }));
    const contact = s2.types[1] as Extract<(typeof s2.types)[number], { kind: 'object' }>;
    expect(contact.fields[0].type).toEqual({ kind: 'ref', typeName: 'common.Author' });
  });

  // 4. delete_type
  it('delete_type: removes the named type', () => {
    const s1 = ok(
      apply(empty, { kind: 'add_type', type: { kind: 'object', name: 'User', fields: [] } }),
    );
    const s2 = ok(apply(s1, { kind: 'delete_type', name: 'User' }));
    expect(s2.types).toEqual([]);
  });

  // 5. add_field
  it('add_field: appends a field and honors an explicit index', () => {
    const base: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [{ name: 'a', type: { kind: 'string' } }],
        },
      ],
    };
    const s1 = ok(
      apply(base, {
        kind: 'add_field',
        typeName: 'User',
        field: { name: 'b', type: { kind: 'number' } },
      }),
    );
    const s1Fields = (s1.types[0] as Extract<(typeof s1.types)[number], { kind: 'object' }>).fields;
    expect(s1Fields.map((f) => f.name)).toEqual(['a', 'b']);

    const s2 = ok(
      apply(base, {
        kind: 'add_field',
        typeName: 'User',
        field: { name: 'b', type: { kind: 'number' } },
        index: 0,
      }),
    );
    const s2Fields = (s2.types[0] as Extract<(typeof s2.types)[number], { kind: 'object' }>).fields;
    expect(s2Fields.map((f) => f.name)).toEqual(['b', 'a']);
  });

  // 6. update_field
  it('update_field: merges a patch onto a named field', () => {
    const base: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [{ name: 'age', type: { kind: 'number' } }],
        },
      ],
    };
    const s1 = ok(
      apply(base, {
        kind: 'update_field',
        typeName: 'User',
        fieldName: 'age',
        patch: { optional: true },
      }),
    );
    const f = (s1.types[0] as Extract<(typeof s1.types)[number], { kind: 'object' }>).fields[0];
    expect(f.optional).toBe(true);
    expect(f.type).toEqual({ kind: 'number' });
  });

  // 7. delete_field
  it('delete_field: removes a named field', () => {
    const base: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [
            { name: 'a', type: { kind: 'string' } },
            { name: 'b', type: { kind: 'number' } },
          ],
        },
      ],
    };
    const s1 = ok(apply(base, { kind: 'delete_field', typeName: 'User', fieldName: 'a' }));
    const fields = (s1.types[0] as Extract<(typeof s1.types)[number], { kind: 'object' }>).fields;
    expect(fields.map((f) => f.name)).toEqual(['b']);
  });

  // 8. reorder_fields
  it('reorder_fields: reorders to match `order`, rejects any unknown field', () => {
    const base: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [
            { name: 'a', type: { kind: 'string' } },
            { name: 'b', type: { kind: 'string' } },
            { name: 'c', type: { kind: 'string' } },
          ],
        },
      ],
    };
    const s1 = ok(
      apply(base, { kind: 'reorder_fields', typeName: 'User', order: ['c', 'a', 'b'] }),
    );
    const fields = (s1.types[0] as Extract<(typeof s1.types)[number], { kind: 'object' }>).fields;
    expect(fields.map((f) => f.name)).toEqual(['c', 'a', 'b']);

    const bad = apply(base, { kind: 'reorder_fields', typeName: 'User', order: ['a', 'b'] });
    expect('error' in bad).toBe(true);
  });

  // 9. add_variant
  it('add_variant: appends a variant to a discriminatedUnion', () => {
    const base: Schema = {
      version: '1',
      types: [
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['Click'],
        },
      ],
    };
    const s1 = ok(apply(base, { kind: 'add_variant', typeName: 'Event', variant: 'Hover' }));
    const du = s1.types[0] as Extract<(typeof s1.types)[number], { kind: 'discriminatedUnion' }>;
    expect(du.variants).toEqual(['Click', 'Hover']);
  });

  // 10. set_discriminator
  it('set_discriminator: updates the discriminator field of a dUnion', () => {
    const base: Schema = {
      version: '1',
      types: [
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: [],
        },
      ],
    };
    const s1 = ok(
      apply(base, { kind: 'set_discriminator', typeName: 'Event', discriminator: 'tag' }),
    );
    const du = s1.types[0] as Extract<(typeof s1.types)[number], { kind: 'discriminatedUnion' }>;
    expect(du.discriminator).toBe('tag');
  });

  // 11. add_import
  it('add_import: appends an import and rejects a duplicate alias', () => {
    const s1 = ok(
      apply(empty, {
        kind: 'add_import',
        import: { kind: 'stdlib', path: '@contexture/common', alias: 'common' },
      }),
    );
    expect(s1.imports).toEqual([{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }]);
    const dup = apply(s1, {
      kind: 'add_import',
      import: { kind: 'stdlib', path: '@contexture/identity', alias: 'common' },
    });
    expect('error' in dup).toBe(true);
  });

  // 12. remove_import
  it('remove_import: drops the import with the named alias', () => {
    const base: Schema = {
      version: '1',
      imports: [
        { kind: 'stdlib', path: '@contexture/common', alias: 'common' },
        { kind: 'stdlib', path: '@contexture/identity', alias: 'identity' },
      ],
      types: [],
    };
    const s1 = ok(apply(base, { kind: 'remove_import', alias: 'common' }));
    expect(s1.imports).toEqual([
      { kind: 'stdlib', path: '@contexture/identity', alias: 'identity' },
    ]);
  });

  // 13. replace_schema — structural pre-flight
  it('replace_schema: installs a valid IR and rejects a structurally-bad one', () => {
    const next: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'User', fields: [] }],
    };
    const s1 = ok(apply(empty, { kind: 'replace_schema', schema: next }));
    expect(s1.types).toEqual([{ kind: 'object', name: 'User', fields: [] }]);

    // Missing version → meta-schema rejects.
    const bad = apply(empty, { kind: 'replace_schema', schema: { types: [] } });
    expect('error' in bad).toBe(true);
  });

  // replace_schema is agnostic about semantic errors (unresolved refs etc.)
  it('replace_schema: accepts structurally-valid IR with semantic issues (validator reports them)', () => {
    const next: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Comment',
          fields: [{ name: 'on', type: { kind: 'ref', typeName: 'MissingType' } }],
        },
      ],
    };
    const s1 = ok(apply(empty, { kind: 'replace_schema', schema: next }));
    expect(s1).toEqual(next);
  });
});
