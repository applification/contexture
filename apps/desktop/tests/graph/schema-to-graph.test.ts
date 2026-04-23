/**
 * IR → XYFlow graph adapter. Pure tests — every rendering decision
 * (local node, imported shadow node, ref edge, nested array unwrap,
 * optional/nullable, summary format) lives in one function so we can
 * pin its behaviour without booting React.
 */
import { buildGraph, summariseFieldType } from '@renderer/components/graph/schema-to-graph';
import type { Schema } from '@renderer/model/ir';
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
    expect(nodes[1]).toMatchObject({ id: 'Season', type: 'type', data: { kind: 'enum' } });
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
