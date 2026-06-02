import { filterGraphView } from '@renderer/components/graph/graph-view';
import type { BuildGraphResult } from '@renderer/components/graph/schema-to-graph';
import { describe, expect, it } from 'vitest';

function graph(): BuildGraphResult {
  return {
    nodes: [
      {
        id: 'Recipe',
        type: 'type',
        position: { x: 0, y: 0 },
        data: { typeName: 'Recipe', kind: 'object', imported: false, fields: [] },
      },
      {
        id: 'Difficulty',
        type: 'type',
        position: { x: 100, y: 0 },
        data: { typeName: 'Difficulty', kind: 'enum', imported: false, fields: [] },
      },
      {
        id: 'common.ExternalEnum',
        type: 'type',
        position: { x: 200, y: 0 },
        data: { typeName: 'common.ExternalEnum', kind: 'enum', imported: true, fields: [] },
      },
      {
        id: 'common.Email',
        type: 'type',
        position: { x: 300, y: 0 },
        data: {
          typeName: 'common.Email',
          kind: 'object',
          imported: true,
          stdlib: true,
          fields: [],
        },
      },
    ],
    edges: [
      {
        id: 'Recipe.difficulty->Difficulty',
        source: 'Recipe',
        target: 'Difficulty',
        type: 'ref',
        data: {
          relation: 'fieldRef',
          sourceType: 'Recipe',
          sourceField: 'difficulty',
          targetType: 'Difficulty',
          crossBoundary: false,
        },
      },
      {
        id: 'Recipe.external->common.ExternalEnum',
        source: 'Recipe',
        target: 'common.ExternalEnum',
        type: 'ref',
        data: {
          relation: 'fieldRef',
          sourceType: 'Recipe',
          sourceField: 'external',
          targetType: 'common.ExternalEnum',
          crossBoundary: true,
        },
      },
      {
        id: 'Recipe.email->common.Email',
        source: 'Recipe',
        target: 'common.Email',
        type: 'ref',
        data: {
          relation: 'fieldRef',
          sourceType: 'Recipe',
          sourceField: 'email',
          targetType: 'common.Email',
          crossBoundary: true,
          stdlib: true,
        },
      },
    ],
  };
}

describe('filterGraphView', () => {
  it('keeps enum nodes and enum edges when enums are visible', () => {
    const result = filterGraphView(graph(), { showEnums: true, showStdlib: true });

    expect(result.nodes.map((node) => node.id)).toEqual([
      'Recipe',
      'Difficulty',
      'common.ExternalEnum',
      'common.Email',
    ]);
    expect(result.edges.map((edge) => edge.id)).toEqual([
      'Recipe.difficulty->Difficulty',
      'Recipe.external->common.ExternalEnum',
      'Recipe.email->common.Email',
    ]);
  });

  it('hides local enum nodes and their incident edges', () => {
    const result = filterGraphView(graph(), { showEnums: false, showStdlib: true });

    expect(result.nodes.map((node) => node.id)).toEqual([
      'Recipe',
      'common.ExternalEnum',
      'common.Email',
    ]);
    expect(result.edges.map((edge) => edge.id)).toEqual([
      'Recipe.external->common.ExternalEnum',
      'Recipe.email->common.Email',
    ]);
  });

  it('hides stdlib nodes and their incident edges independently of other imports', () => {
    const result = filterGraphView(graph(), { showEnums: true, showStdlib: false });

    expect(result.nodes.map((node) => node.id)).toEqual([
      'Recipe',
      'Difficulty',
      'common.ExternalEnum',
    ]);
    expect(result.edges.map((edge) => edge.id)).toEqual([
      'Recipe.difficulty->Difficulty',
      'Recipe.external->common.ExternalEnum',
    ]);
  });
});
