import type { Schema } from '@renderer/model/ir';
import { validate } from '@renderer/services/validation';
import { describe, expect, it } from 'vitest';

describe('validate', () => {
  it('returns no errors for an empty v1 schema (rule 1: structural already enforced by loader)', () => {
    const errs = validate({ version: '1', types: [] });
    expect(errs).toEqual([]);
  });

  // Rule 3: no duplicate type names
  it('rule 3: flags duplicate type names at the second occurrence', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'User', fields: [] },
        { kind: 'object', name: 'User', fields: [] },
      ],
    };
    const errs = validate(schema);
    const dup = errs.find((e) => e.code === 'duplicate_type_name');
    expect(dup).toEqual({
      code: 'duplicate_type_name',
      path: 'types.1',
      message: 'Duplicate type name "User".',
    });
  });

  // Rule 2: ref.typeName must resolve
  it('rule 2: bare ref to a local type name resolves', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Post', fields: [] },
        {
          kind: 'object',
          name: 'Comment',
          fields: [{ name: 'on', type: { kind: 'ref', typeName: 'Post' } }],
        },
      ],
    };
    expect(validate(schema).some((e) => e.code === 'unresolved_ref')).toBe(false);
  });

  it('rule 2: flags an unknown bare ref with the field path', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Comment',
          fields: [{ name: 'on', type: { kind: 'ref', typeName: 'Post' } }],
        },
      ],
    };
    const err = validate(schema).find((e) => e.code === 'unresolved_ref');
    expect(err).toEqual({
      code: 'unresolved_ref',
      path: 'types.0.fields.0.type',
      message: 'Unresolved ref "Post".',
    });
  });

  it('rule 2: qualified ref resolves when its alias is in imports', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      types: [
        {
          kind: 'object',
          name: 'Contact',
          fields: [{ name: 'email', type: { kind: 'ref', typeName: 'common.Email' } }],
        },
      ],
    };
    expect(validate(schema).some((e) => e.code === 'unresolved_ref')).toBe(false);
  });

  it('rule 2: qualified ref fails when no matching alias exists', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Contact',
          fields: [{ name: 'email', type: { kind: 'ref', typeName: 'common.Email' } }],
        },
      ],
    };
    const err = validate(schema).find((e) => e.code === 'unresolved_ref');
    expect(err).toEqual({
      code: 'unresolved_ref',
      path: 'types.0.fields.0.type',
      message: 'Unresolved ref "common.Email".',
    });
  });

  it('rule 2: flags unresolved ref inside an array element', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Bag',
          fields: [
            {
              name: 'items',
              type: { kind: 'array', element: { kind: 'ref', typeName: 'Missing' } },
            },
          ],
        },
      ],
    };
    const err = validate(schema).find((e) => e.code === 'unresolved_ref');
    expect(err?.path).toBe('types.0.fields.0.type.element');
  });

  // Rule 4: discriminatedUnion constraints
  it('rule 4: accepts a discriminatedUnion whose variants are objects with the discriminator', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Click',
          fields: [
            { name: 'type', type: { kind: 'literal', value: 'click' } },
            { name: 'x', type: { kind: 'number' } },
          ],
        },
        {
          kind: 'object',
          name: 'Hover',
          fields: [
            { name: 'type', type: { kind: 'literal', value: 'hover' } },
            { name: 'target', type: { kind: 'string' } },
          ],
        },
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['Click', 'Hover'],
        },
      ],
    };
    const errs = validate(schema).filter((e) => e.code.startsWith('discriminator_'));
    expect(errs).toEqual([]);
  });

  it('rule 4: flags a discriminatedUnion variant that does not exist', () => {
    const schema: Schema = {
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
    const err = validate(schema).find((e) => e.code === 'discriminator_variant_not_found');
    expect(err).toEqual({
      code: 'discriminator_variant_not_found',
      path: 'types.0.variants.0',
      message: 'Discriminated union variant "Click" is not defined.',
    });
  });

  it('rule 4: flags a variant that is not an object type', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'enum', name: 'Color', values: [{ value: 'red' }] },
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['Color'],
        },
      ],
    };
    const err = validate(schema).find((e) => e.code === 'discriminator_variant_not_object');
    expect(err).toEqual({
      code: 'discriminator_variant_not_object',
      path: 'types.1.variants.0',
      message: 'Discriminated union variant "Color" must be an object type.',
    });
  });

  it('rule 4: flags a variant object missing the discriminator field', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Click',
          fields: [{ name: 'x', type: { kind: 'number' } }],
        },
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['Click'],
        },
      ],
    };
    const err = validate(schema).find((e) => e.code === 'discriminator_missing_on_variant');
    expect(err).toEqual({
      code: 'discriminator_missing_on_variant',
      path: 'types.1.variants.0',
      message: 'Variant "Click" is missing discriminator field "type".',
    });
  });

  // Rule 5: enum constraints
  it('rule 5: flags an enum with no values', () => {
    const schema: Schema = {
      version: '1',
      types: [{ kind: 'enum', name: 'Role', values: [] }],
    };
    const err = validate(schema).find((e) => e.code === 'enum_empty');
    expect(err).toEqual({
      code: 'enum_empty',
      path: 'types.0.values',
      message: 'Enum "Role" must have at least one value.',
    });
  });

  it('rule 5: flags duplicate enum values', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'enum',
          name: 'Role',
          values: [{ value: 'admin' }, { value: 'member' }, { value: 'admin' }],
        },
      ],
    };
    const err = validate(schema).find((e) => e.code === 'enum_duplicate_value');
    expect(err).toEqual({
      code: 'enum_duplicate_value',
      path: 'types.0.values.2',
      message: 'Duplicate enum value "admin" in "Role".',
    });
  });

  it('rule 5: accepts a non-empty enum with unique values', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'enum',
          name: 'Role',
          values: [{ value: 'admin' }, { value: 'member' }],
        },
      ],
    };
    expect(validate(schema).some((e) => e.code.startsWith('enum_'))).toBe(false);
  });

  // Rule 6: unique import aliases
  it('rule 6: flags duplicate import aliases', () => {
    const schema: Schema = {
      version: '1',
      imports: [
        { kind: 'stdlib', path: '@contexture/common', alias: 'lib' },
        { kind: 'relative', path: './other.contexture.json', alias: 'lib' },
      ],
      types: [],
    };
    const err = validate(schema).find((e) => e.code === 'duplicate_alias');
    expect(err).toEqual({
      code: 'duplicate_alias',
      path: 'imports.1',
      message: 'Duplicate import alias "lib".',
    });
  });

  it('rule 6: accepts unique aliases', () => {
    const schema: Schema = {
      version: '1',
      imports: [
        { kind: 'stdlib', path: '@contexture/common', alias: 'common' },
        { kind: 'stdlib', path: '@contexture/identity', alias: 'identity' },
      ],
      types: [],
    };
    expect(validate(schema).some((e) => e.code === 'duplicate_alias')).toBe(false);
  });

  // Rule 7: Zod emit compiles (sandboxed eval wired up in #83).
  it('rule 7: does not fail for schemas that would emit valid Zod (stub pending #83)', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [{ name: 'email', type: { kind: 'string', format: 'email' } }],
        },
      ],
    };
    expect(validate(schema).some((e) => e.code === 'zod_compile_failed')).toBe(false);
  });

  it('rule 3: accepts distinct type names', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'User', fields: [] },
        { kind: 'object', name: 'Post', fields: [] },
      ],
    };
    expect(validate(schema).some((e) => e.code === 'duplicate_type_name')).toBe(false);
  });
});
