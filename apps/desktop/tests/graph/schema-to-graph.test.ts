/**
 * IR → XYFlow graph adapter. Pure tests — every rendering decision
 * (local node, imported shadow node, ref edge, nested array unwrap,
 * optional/nullable, summary format) lives in one function so we can
 * pin its behaviour without booting React.
 */

import type { Schema } from '@contexture/core/ir';
import { applyValidationHighlights } from '@renderer/components/graph/GraphCanvas';
import { buildGraph, summariseFieldType } from '@renderer/components/graph/schema-to-graph';
import { describe, expect, it } from 'vitest';

describe('buildGraph', () => {
  it('emits one node per TypeDef', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Plot', fields: [] },
        { kind: 'enum', name: 'Season', values: [{ value: 'spring' }, { value: 'summer' }] },
      ],
    };
    const { nodes } = buildGraph({ schema });
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: 'Plot', type: 'type', data: { kind: 'object' } });
    expect(nodes[0].data.canAddFields).toBe(true);
    expect(nodes[1]).toMatchObject({
      id: 'Season',
      type: 'type',
      data: {
        kind: 'enum',
        enumValues: [{ value: 'spring' }, { value: 'summer' }],
      },
    });
  });

  it('passes enum descriptions and value descriptions into node data', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'enum',
          name: 'Season',
          description: 'The growing season.',
          values: [{ value: 'spring', description: 'Planting time.' }, { value: 'summer' }],
        },
      ],
    };

    const { nodes } = buildGraph({ schema });

    expect(nodes[0].data).toMatchObject({
      kind: 'enum',
      description: 'The growing season.',
      enumValues: [{ value: 'spring', description: 'Planting time.' }, { value: 'summer' }],
    });
  });

  it('passes local enum metadata into referring object field rows', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Recipe',
          fields: [{ name: 'season', type: { kind: 'ref', typeName: 'Season' } }],
        },
        {
          kind: 'enum',
          name: 'Season',
          description: 'The growing season.',
          values: [{ value: 'spring', description: 'Planting time.' }, { value: 'summer' }],
        },
      ],
    };

    const { nodes } = buildGraph({ schema });
    const recipe = nodes.find((node) => node.id === 'Recipe');

    expect(recipe?.data.fields[0]).toMatchObject({
      name: 'season',
      summary: '→ Season',
      refTarget: 'Season',
      refTargetKind: 'enum',
      enumTarget: {
        name: 'Season',
        description: 'The growing season.',
        values: [{ value: 'spring', description: 'Planting time.' }, { value: 'summer' }],
      },
    });
  });

  it('marks stdlib refs as stdlib shadow nodes and field hover metadata', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [{ name: 'email', type: { kind: 'ref', typeName: 'common.Email' } }],
        },
      ],
    };

    const { nodes, edges } = buildGraph({ schema });
    const user = nodes.find((node) => node.id === 'User');
    const email = nodes.find((node) => node.id === 'common.Email');

    expect(email?.data).toMatchObject({
      typeName: 'common.Email',
      imported: true,
      stdlib: true,
    });
    expect(user?.data.fields[0]).toMatchObject({
      name: 'email',
      summary: '→ common.Email',
      refTarget: 'common.Email',
      stdlibTarget: {
        name: 'common.Email',
        description: 'Email address.',
        kind: 'raw',
      },
    });
    expect(edges[0]).toMatchObject({
      id: 'User.email->common.Email',
      data: {
        crossBoundary: true,
        stdlib: true,
      },
    });
  });

  it('passes local ref target kind into object field rows', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Artwork',
          fields: [
            { name: 'dimensions', type: { kind: 'ref', typeName: 'ArtworkDimensions' } },
            { name: 'source', type: { kind: 'ref', typeName: 'ArtworkSourceReference' } },
          ],
        },
        { kind: 'object', name: 'ArtworkDimensions', fields: [] },
        {
          kind: 'discriminatedUnion',
          name: 'ArtworkSourceReference',
          discriminator: 'kind',
          variants: ['PosterReference'],
        },
      ],
    };

    const { nodes } = buildGraph({ schema });
    const artwork = nodes.find((node) => node.id === 'Artwork');

    expect(artwork?.data.fields).toEqual([
      expect.objectContaining({ name: 'dimensions', refTargetKind: 'object' }),
      expect.objectContaining({ name: 'source', refTargetKind: 'discriminatedUnion' }),
    ]);
  });

  it('renders object fields as field rows with summaries', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Plot',
          fields: [
            { name: 'name', type: { kind: 'string' } },
            { name: 'area', type: { kind: 'number' }, optional: true },
            { name: 'tags', type: { kind: 'array', element: { kind: 'string' } } },
          ],
        },
      ],
    };
    const { nodes } = buildGraph({ schema });
    const fields = nodes[0].data.fields;
    expect(fields.map((f) => `${f.name}${f.optional ? '?' : ''}=${f.summary}`)).toEqual([
      'name=string',
      'area?=number',
      'tags=string[]',
    ]);
  });

  it('can apply validation highlights to affected nodes and fields', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [{ name: 'author', type: { kind: 'ref', typeName: 'Author' } }],
        },
      ],
    };

    const graph = applyValidationHighlights(buildGraph({ schema }), [
      { path: 'types.0.fields.0.type' },
    ]);

    expect(graph.nodes[0].data).toMatchObject({
      validationIssueCount: 1,
      fields: [expect.objectContaining({ name: 'author', validationIssueCount: 1 })],
    });
  });

  it('applies validation highlights by schema index when type names are duplicated', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
        {
          kind: 'object',
          name: 'Post',
          fields: [{ name: 'author', type: { kind: 'ref', typeName: 'Author' } }],
        },
      ],
    };

    const graph = applyValidationHighlights(buildGraph({ schema }), [
      { path: 'types.1.fields.0.type' },
    ]);

    expect(graph.nodes[0].data).toMatchObject({
      typeName: 'Post',
      schemaIndex: 0,
      fields: [expect.objectContaining({ name: 'title' })],
    });
    expect(graph.nodes[0].data.validationIssueCount).toBeUndefined();
    expect(graph.nodes[0].data.fields[0]?.validationIssueCount).toBeUndefined();
    expect(graph.nodes[1].data).toMatchObject({
      typeName: 'Post',
      schemaIndex: 1,
      validationIssueCount: 1,
      fields: [expect.objectContaining({ name: 'author', validationIssueCount: 1 })],
    });
  });

  it('emits a ref edge for a ref field and leaves no shadow node when target is local', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Harvest', fields: [] },
        {
          kind: 'object',
          name: 'Plot',
          fields: [{ name: 'harvest', type: { kind: 'ref', typeName: 'Harvest' } }],
        },
      ],
    };
    const { nodes, edges } = buildGraph({ schema });
    // Only the two local TypeDefs → two nodes, no shadow.
    expect(nodes.map((n) => n.id)).toEqual(['Harvest', 'Plot']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'Plot',
      target: 'Harvest',
      type: 'ref',
      data: { crossBoundary: false, sourceField: 'harvest' },
    });
  });

  it('creates a shadow imported node for a qualified ref target', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [{ name: 'email', type: { kind: 'ref', typeName: 'common.Email' } }],
        },
      ],
    };
    const { nodes, edges } = buildGraph({ schema });
    const shadow = nodes.find((n) => n.id === 'common.Email');
    expect(shadow?.data.imported).toBe(true);
    expect(edges).toHaveLength(1);
    expect(edges[0].data?.crossBoundary).toBe(true);
  });

  it('deduplicates shadow nodes across multiple refs to the same target', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'A',
          fields: [
            { name: 'e1', type: { kind: 'ref', typeName: 'common.Email' } },
            { name: 'e2', type: { kind: 'ref', typeName: 'common.Email' } },
          ],
        },
      ],
    };
    const { nodes, edges } = buildGraph({ schema });
    const shadows = nodes.filter((n) => n.id === 'common.Email');
    expect(shadows).toHaveLength(1);
    expect(edges).toHaveLength(2);
  });

  it('unwraps nested arrays to the ref element', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Harvest', fields: [] },
        {
          kind: 'object',
          name: 'Plot',
          fields: [
            {
              name: 'harvests',
              type: {
                kind: 'array',
                element: { kind: 'array', element: { kind: 'ref', typeName: 'Harvest' } },
              },
            },
          ],
        },
      ],
    };
    const { edges } = buildGraph({ schema });
    expect(edges).toEqual([expect.objectContaining({ source: 'Plot', target: 'Harvest' })]);
  });

  it('emits a diagram-only edge for table Id fields whose description names a table', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Team', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Member',
          table: true,
          fields: [
            {
              name: 'teamId',
              description: 'Convex Id of the Team table.',
              type: { kind: 'string' },
            },
          ],
        },
      ],
    };

    const { nodes, edges } = buildGraph({ schema });

    expect(nodes.map((n) => n.id)).toEqual(['Team', 'Member']);
    expect(edges).toEqual([
      expect.objectContaining({
        id: 'Member.teamId~>Team',
        source: 'Member',
        target: 'Team',
        type: 'ref',
        data: expect.objectContaining({
          relation: 'tableId',
          sourceField: 'teamId',
          targetType: 'Team',
          crossBoundary: false,
        }),
      }),
    ]);
  });

  it('uses tableName aliases when inferring diagram-only table Id edges', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Team', table: true, tableName: 'teams', fields: [] },
        {
          kind: 'object',
          name: 'Member',
          table: true,
          fields: [
            {
              name: 'teamId',
              description: 'References a document in the teams table.',
              type: { kind: 'string' },
            },
          ],
        },
      ],
    };

    const { edges } = buildGraph({ schema });

    expect(edges).toEqual([expect.objectContaining({ source: 'Member', target: 'Team' })]);
  });

  it('does not infer table Id edges for non-table objects or fields without table descriptions', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Team', table: true, fields: [] },
        {
          kind: 'object',
          name: 'DraftMember',
          fields: [
            {
              name: 'teamId',
              description: 'Convex Id of the Team table.',
              type: { kind: 'string' },
            },
          ],
        },
        {
          kind: 'object',
          name: 'Member',
          table: true,
          fields: [
            {
              name: 'teamId',
              description: 'Persisted owner identifier.',
              type: { kind: 'string' },
            },
          ],
        },
      ],
    };

    const { edges } = buildGraph({ schema });

    expect(edges).toEqual([]);
  });

  it('emits variant edges from discriminated unions to their object variants', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'discriminatedUnion',
          name: 'ArtworkSourceReference',
          discriminator: 'kind',
          variants: ['MusicianReference', 'GearReference'],
        },
        {
          kind: 'object',
          name: 'MusicianReference',
          fields: [{ name: 'kind', type: { kind: 'literal', value: 'musician' } }],
        },
        {
          kind: 'object',
          name: 'GearReference',
          fields: [{ name: 'kind', type: { kind: 'literal', value: 'gear' } }],
        },
      ],
    };

    const { nodes, edges } = buildGraph({ schema });

    expect(nodes.map((n) => n.id)).toEqual([
      'ArtworkSourceReference',
      'MusicianReference',
      'GearReference',
    ]);
    expect(edges).toEqual([
      expect.objectContaining({
        id: 'ArtworkSourceReference.variant->MusicianReference',
        source: 'ArtworkSourceReference',
        target: 'MusicianReference',
        type: 'ref',
        data: expect.objectContaining({
          relation: 'unionVariant',
          discriminator: 'kind',
          crossBoundary: false,
        }),
      }),
      expect.objectContaining({
        id: 'ArtworkSourceReference.variant->GearReference',
        source: 'ArtworkSourceReference',
        target: 'GearReference',
        type: 'ref',
        data: expect.objectContaining({
          relation: 'unionVariant',
          discriminator: 'kind',
          crossBoundary: false,
        }),
      }),
    ]);
  });

  it('applies sidecar positions and falls back to 0,0 for missing keys', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'A', fields: [] },
        { kind: 'object', name: 'B', fields: [] },
      ],
    };
    const { nodes } = buildGraph({
      schema,
      positions: { A: { x: 100, y: 200 } },
    });
    expect(nodes.find((n) => n.id === 'A')?.position).toEqual({ x: 100, y: 200 });
    expect(nodes.find((n) => n.id === 'B')?.position).toEqual({ x: 0, y: 0 });
  });
});

describe('summariseFieldType', () => {
  it('formats string with format + range', () => {
    expect(summariseFieldType({ kind: 'string', format: 'email' })).toBe('string(email)');
    expect(summariseFieldType({ kind: 'string', min: 1, max: 80 })).toBe('string(1–80)');
  });

  it('formats number int + range', () => {
    expect(summariseFieldType({ kind: 'number', int: true })).toBe('int');
    expect(summariseFieldType({ kind: 'number', min: 0, max: 100 })).toBe('number(0–100)');
  });

  it('formats literal + ref + array', () => {
    expect(summariseFieldType({ kind: 'literal', value: 'ok' })).toBe('literal("ok")');
    expect(summariseFieldType({ kind: 'ref', typeName: 'X' })).toBe('→ X');
    expect(summariseFieldType({ kind: 'array', element: { kind: 'boolean' } })).toBe('boolean[]');
  });
});
