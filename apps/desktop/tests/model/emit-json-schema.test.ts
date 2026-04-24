import { emit } from '@renderer/model/emit-json-schema';
import type { Schema } from '@renderer/model/ir';
import { describe, expect, it } from 'vitest';

describe('emit (JSON Schema)', () => {
  it('emits a root document with $schema and empty $defs for an empty IR', () => {
    const out = emit({ version: '1', types: [] });
    expect(out).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $contexture_generated: expect.stringContaining('@contexture-generated'),
      $defs: {},
    });
  });

  it('carries an @contexture-generated marker on the root for drift detection', () => {
    const out = emit({ version: '1', types: [] }) as { $contexture_generated?: unknown };
    expect(typeof out.$contexture_generated).toBe('string');
    expect(out.$contexture_generated).toContain('@contexture-generated');
  });

  it('emits an object TypeDef as an object schema in $defs', () => {
    const out = emit({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [
            { name: 'title', type: { kind: 'string' } },
            { name: 'views', type: { kind: 'number' } },
            { name: 'published', type: { kind: 'boolean' } },
            { name: 'createdAt', type: { kind: 'date' } },
          ],
        },
      ],
    }) as { $defs: Record<string, unknown> };
    expect(out.$defs.Post).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string' },
        views: { type: 'number' },
        published: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: ['title', 'views', 'published', 'createdAt'],
      additionalProperties: false,
    });
  });

  it('applies string constraints: minLength / maxLength / pattern / format', () => {
    const out = emit({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Profile',
          fields: [
            { name: 'handle', type: { kind: 'string', min: 3, max: 20 } },
            { name: 'slug', type: { kind: 'string', regex: '^[a-z]+$' } },
            { name: 'email', type: { kind: 'string', format: 'email' } },
            { name: 'site', type: { kind: 'string', format: 'url' } },
            { name: 'id', type: { kind: 'string', format: 'uuid' } },
            { name: 'at', type: { kind: 'string', format: 'datetime' } },
          ],
        },
      ],
    }) as { $defs: { Profile: { properties: Record<string, unknown> } } };
    const props = out.$defs.Profile.properties;
    expect(props.handle).toEqual({ type: 'string', minLength: 3, maxLength: 20 });
    expect(props.slug).toEqual({ type: 'string', pattern: '^[a-z]+$' });
    expect(props.email).toEqual({ type: 'string', format: 'email' });
    expect(props.site).toEqual({ type: 'string', format: 'uri' });
    expect(props.id).toEqual({ type: 'string', format: 'uuid' });
    expect(props.at).toEqual({ type: 'string', format: 'date-time' });
  });

  it('applies number constraints: minimum / maximum / integer', () => {
    const out = emit({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Stats',
          fields: [
            { name: 'count', type: { kind: 'number', int: true, min: 0 } },
            { name: 'ratio', type: { kind: 'number', min: 0, max: 1 } },
          ],
        },
      ],
    }) as { $defs: { Stats: { properties: Record<string, unknown> } } };
    expect(out.$defs.Stats.properties.count).toEqual({ type: 'integer', minimum: 0 });
    expect(out.$defs.Stats.properties.ratio).toEqual({ type: 'number', minimum: 0, maximum: 1 });
  });

  it('emits literal fields as const', () => {
    const out = emit({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Tag',
          fields: [
            { name: 'kind', type: { kind: 'literal', value: 'click' } },
            { name: 'n', type: { kind: 'literal', value: 42 } },
            { name: 'b', type: { kind: 'literal', value: true } },
          ],
        },
      ],
    }) as { $defs: { Tag: { properties: Record<string, unknown> } } };
    expect(out.$defs.Tag.properties.kind).toEqual({ const: 'click' });
    expect(out.$defs.Tag.properties.n).toEqual({ const: 42 });
    expect(out.$defs.Tag.properties.b).toEqual({ const: true });
  });

  it('emits array fields with nested element and min/maxItems', () => {
    const out = emit({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Bag',
          fields: [
            { name: 'tags', type: { kind: 'array', element: { kind: 'string' } } },
            {
              name: 'scores',
              type: { kind: 'array', element: { kind: 'number' }, min: 1, max: 5 },
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
    }) as { $defs: { Bag: { properties: Record<string, unknown> } } };
    expect(out.$defs.Bag.properties.tags).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(out.$defs.Bag.properties.scores).toEqual({
      type: 'array',
      items: { type: 'number' },
      minItems: 1,
      maxItems: 5,
    });
    expect(out.$defs.Bag.properties.matrix).toEqual({
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
    });
  });

  it('drops optional fields from required and wraps nullable with type union', () => {
    const out = emit({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [
            { name: 'title', type: { kind: 'string' } },
            { name: 'subtitle', type: { kind: 'string' }, optional: true },
            { name: 'slug', type: { kind: 'string' }, nullable: true },
            { name: 'draft', type: { kind: 'boolean' }, default: false },
          ],
        },
      ],
    }) as {
      $defs: {
        Post: {
          properties: Record<string, { type?: unknown; default?: unknown }>;
          required: string[];
        };
      };
    };
    expect(out.$defs.Post.required).toEqual(['title', 'slug', 'draft']);
    expect(out.$defs.Post.properties.slug).toEqual({ type: ['string', 'null'] });
    expect(out.$defs.Post.properties.draft).toEqual({ type: 'boolean', default: false });
  });

  it('emits a local ref as $ref into $defs', () => {
    const out = emit({
      version: '1',
      types: [
        { kind: 'object', name: 'Post', fields: [] },
        {
          kind: 'object',
          name: 'Comment',
          fields: [{ name: 'on', type: { kind: 'ref', typeName: 'Post' } }],
        },
      ],
    }) as { $defs: { Comment: { properties: Record<string, unknown> } } };
    expect(out.$defs.Comment.properties.on).toEqual({ $ref: '#/$defs/Post' });
  });

  it('emits a stdlib qualified ref as $ref to the runtime package URL', () => {
    const out = emit({
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      types: [
        {
          kind: 'object',
          name: 'Contact',
          fields: [{ name: 'email', type: { kind: 'ref', typeName: 'common.Email' } }],
        },
      ],
    }) as { $defs: { Contact: { properties: Record<string, unknown> } } };
    expect(out.$defs.Contact.properties.email).toEqual({
      $ref: '@contexture/runtime/common#/$defs/Email',
    });
  });

  it('emits a relative qualified ref as $ref to the sibling schema file', () => {
    const out = emit({
      version: '1',
      imports: [{ kind: 'relative', path: './other.contexture.json', alias: 'other' }],
      types: [
        {
          kind: 'object',
          name: 'Link',
          fields: [{ name: 'ref', type: { kind: 'ref', typeName: 'other.Post' } }],
        },
      ],
    }) as { $defs: { Link: { properties: Record<string, unknown> } } };
    expect(out.$defs.Link.properties.ref).toEqual({
      $ref: './other.schema.json#/$defs/Post',
    });
  });

  it('emits an enum TypeDef as a string schema with enum values', () => {
    const out = emit({
      version: '1',
      types: [
        {
          kind: 'enum',
          name: 'Role',
          values: [{ value: 'admin' }, { value: 'member' }],
        },
      ],
    }) as { $defs: Record<string, unknown> };
    expect(out.$defs.Role).toEqual({ type: 'string', enum: ['admin', 'member'] });
  });

  it('emits a discriminatedUnion as oneOf over $ref variants', () => {
    const out = emit({
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
    }) as { $defs: Record<string, unknown> };
    expect(out.$defs.Event).toEqual({
      oneOf: [{ $ref: '#/$defs/Click' }, { $ref: '#/$defs/Hover' }],
      discriminator: { propertyName: 'type' },
    });
  });

  it('emits a raw TypeDef by copying its jsonSchema verbatim', () => {
    const out = emit({
      version: '1',
      types: [
        {
          kind: 'raw',
          name: 'Money',
          zod: '',
          jsonSchema: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              currency: { type: 'string', minLength: 3, maxLength: 3 },
            },
            required: ['amount', 'currency'],
          },
        },
      ],
    }) as { $defs: Record<string, unknown> };
    expect(out.$defs.Money).toEqual({
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
      },
      required: ['amount', 'currency'],
    });
  });

  it('when given a rootTypeName, inlines that type at the top level and keeps the rest in $defs', () => {
    const out = emit(
      {
        version: '1',
        types: [
          { kind: 'object', name: 'Author', fields: [{ name: 'name', type: { kind: 'string' } }] },
          {
            kind: 'object',
            name: 'Post',
            fields: [{ name: 'by', type: { kind: 'ref', typeName: 'Author' } }],
          },
        ],
      },
      'Post',
    ) as { type?: string; properties?: Record<string, unknown>; $defs?: Record<string, unknown> };
    expect(out.type).toBe('object');
    expect(out.properties?.by).toEqual({ $ref: '#/$defs/Author' });
    expect(out.$defs?.Author).toBeDefined();
    expect(out.$defs?.Post).toBeUndefined();
  });

  it('snapshot: representative IR covering all 4 TypeDef kinds and all 8 FieldType kinds', () => {
    const schema: Schema = {
      version: '1',
      imports: [
        { kind: 'stdlib', path: '@contexture/common', alias: 'common' },
        { kind: 'relative', path: './other.contexture.json', alias: 'other' },
      ],
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [
            { name: 'title', type: { kind: 'string', min: 1, max: 120 } },
            { name: 'views', type: { kind: 'number', int: true, min: 0 } },
            { name: 'published', type: { kind: 'boolean' }, default: false },
            { name: 'createdAt', type: { kind: 'date' } },
            { name: 'kind', type: { kind: 'literal', value: 'post' } },
            { name: 'author', type: { kind: 'ref', typeName: 'common.Email' } },
            { name: 'linked', type: { kind: 'ref', typeName: 'other.Ref' } },
            {
              name: 'tags',
              optional: true,
              type: { kind: 'array', element: { kind: 'string' } },
            },
          ],
        },
        { kind: 'enum', name: 'Role', values: [{ value: 'admin' }, { value: 'member' }] },
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
        {
          kind: 'raw',
          name: 'Money',
          zod: '',
          jsonSchema: {
            type: 'object',
            properties: { amount: { type: 'number' }, currency: { type: 'string' } },
            required: ['amount', 'currency'],
          },
        },
      ],
    };
    expect(emit(schema)).toMatchSnapshot();
  });
});
