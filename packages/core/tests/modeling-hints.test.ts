import { describe, expect, it } from 'vitest';
import type { Schema } from '../src/ir';
import { analyzeModelingHints } from '../src/modeling-hints';

const misprintSlice: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Artwork',
      table: true,
      fields: [
        { name: 'slug', type: { kind: 'string' } },
        {
          name: 'sourceKind',
          description: 'Denormalized source category for filtering artwork lists.',
          type: { kind: 'string' },
        },
        {
          name: 'sourceSearchText',
          description: 'Denormalized lowercase search text assembled from source metadata.',
          type: { kind: 'string' },
        },
        {
          name: 'media',
          type: { kind: 'array', element: { kind: 'ref', typeName: 'ArtworkMedia' } },
        },
        {
          name: 'palette',
          type: { kind: 'array', element: { kind: 'ref', typeName: 'ArtworkPaletteColor' } },
        },
      ],
      indexes: [{ name: 'by_source_kind', fields: ['sourceKind'] }],
    },
    {
      kind: 'object',
      name: 'ArtworkMedia',
      fields: [
        { name: 'storageId', type: { kind: 'string' } },
        { name: 'url', type: { kind: 'string', format: 'url' } },
        { name: 'alt', type: { kind: 'string' } },
      ],
    },
    {
      kind: 'object',
      name: 'ArtworkPaletteColor',
      fields: [
        { name: 'hex', type: { kind: 'string' } },
        { name: 'sortOrder', type: { kind: 'number' } },
        { name: 'notes', type: { kind: 'string' }, optional: true },
      ],
    },
  ],
};

describe('analyzeModelingHints', () => {
  it('identifies identity pressure on embedded objects without making validation issues', () => {
    const hints = analyzeModelingHints(misprintSlice);

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'possible_entity',
          typeName: 'ArtworkMedia',
          title: 'Possible entity',
          signals: ['identity_pressure'],
          fieldNames: ['storageId', 'url'],
        }),
      ]),
    );
  });

  it('identifies query handles on table fields including denormalized search fields', () => {
    const hints = analyzeModelingHints(misprintSlice);
    const queryHandles = hints
      .filter((hint) => hint.kind === 'query_handle')
      .map((hint) => hint.fieldName);

    expect(queryHandles).toEqual(
      expect.arrayContaining(['slug', 'sourceKind', 'sourceSearchText']),
    );
    expect(hints.find((hint) => hint.fieldName === 'sourceSearchText')?.message).toMatch(
      /denormalized/i,
    );
  });

  it('identifies embedded collections and explains when the shape can remain embedded', () => {
    const hints = analyzeModelingHints(misprintSlice);

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'embedded_collection',
          typeName: 'Artwork',
          fieldName: 'media',
          signals: ['embedded_collection_pressure', 'relationship_pressure'],
        }),
      ]),
    );
    expect(hints.find((hint) => hint.fieldName === 'media')?.message).toMatch(/Keep it embedded/i);
  });

  it('emits positive owned value object guidance for embedded owned structure', () => {
    const hints = analyzeModelingHints(misprintSlice);

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'owned_value_object',
          typeName: 'ArtworkPaletteColor',
          title: 'Owned value object',
        }),
      ]),
    );
  });
});
