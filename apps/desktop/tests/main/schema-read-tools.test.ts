import type { Schema } from '@contexture/core/ir';
import { createSchemaReadTools } from '@main/providers/schema-read-tools';
import { describe, expect, it } from 'vitest';

const schema: Schema = {
  version: '1',
  metadata: { evolutionPolicy: 'scratch' },
  types: [
    {
      kind: 'object',
      name: 'Recipe',
      table: true,
      fields: [
        { name: 'title', type: { kind: 'string' } },
        { name: 'ingredients', type: { kind: 'array', element: { kind: 'string' } } },
      ],
      indexes: [{ name: 'by_title', fields: ['title'] }],
    },
    {
      kind: 'enum',
      name: 'MealKind',
      values: [{ value: 'breakfast' }, { value: 'dinner' }],
    },
  ],
};

describe('schema read tools', () => {
  it('summarizes the current schema without returning the full IR by default', async () => {
    const tools = createSchemaReadTools(() => schema);
    const inspect = tools.find((tool) => tool.name === 'inspect_current_schema');

    const result = await inspect?.handler({});

    expect(result).toMatchObject({
      version: '1',
      evolutionPolicy: expect.objectContaining({
        value: 'scratch',
        guidance: expect.stringContaining('No meaningful data'),
      }),
      typeCount: 2,
      types: [
        expect.objectContaining({
          name: 'Recipe',
          kind: 'object',
          table: true,
          fields: ['title', 'ingredients'],
          indexes: ['by_title'],
        }),
        expect.objectContaining({
          name: 'MealKind',
          kind: 'enum',
          values: ['breakfast', 'dinner'],
        }),
      ],
    });
    expect(result).not.toHaveProperty('schema');
  });

  it('returns the full schema only when explicitly requested', async () => {
    const inspect = createSchemaReadTools(() => schema).find(
      (tool) => tool.name === 'inspect_current_schema',
    );

    await expect(inspect?.handler({ includeSchema: true })).resolves.toMatchObject({ schema });
  });

  it('returns exact type definitions by name', async () => {
    const getType = createSchemaReadTools(() => schema).find((tool) => tool.name === 'get_type');

    await expect(getType?.handler({ typeName: 'Recipe' })).resolves.toMatchObject({
      found: true,
      type: expect.objectContaining({ name: 'Recipe', table: true }),
    });
    await expect(getType?.handler({ typeName: 'Missing' })).resolves.toMatchObject({
      found: false,
      availableTypes: ['Recipe', 'MealKind'],
    });
  });

  it('exposes the domain brief for the current schema', async () => {
    const brief = createSchemaReadTools(() => schema).find(
      (tool) => tool.name === 'inspect_domain_brief',
    );

    await expect(brief?.handler({})).resolves.toMatchObject({
      evolutionPolicy: expect.objectContaining({ value: 'scratch' }),
      brief: {
        unresolvedDecisions: expect.any(Array),
        declaredDecisions: expect.any(Array),
      },
    });
  });
});
