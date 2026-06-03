import { describe, expect, it } from 'vitest';
import { emitStructuredOutputSchemas, type Schema } from '../src';

const schema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Lead',
      description: 'A qualified sales lead.',
      fields: [
        { name: 'email', type: { kind: 'string', format: 'email' } },
        { name: 'score', type: { kind: 'number', int: true } },
      ],
    },
  ],
};

describe('emitStructuredOutputSchemas', () => {
  it('emits provider-neutral structured output definitions backed by JSON Schema', () => {
    const doc = emitStructuredOutputSchemas(
      schema,
      '/repo/packages/contexture/crm.contexture.json',
    );

    expect(doc).toMatchObject({
      version: '1',
      $contexture_generated: expect.stringContaining('@contexture-generated'),
      schemas: [
        {
          name: 'Lead',
          description: 'A qualified sales lead.',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              score: { type: 'integer' },
            },
            required: ['email', 'score'],
            additionalProperties: false,
          },
        },
      ],
    });
  });

  it('emits table refs as id strings in structured output schemas', () => {
    const doc = emitStructuredOutputSchemas({
      version: '1',
      types: [
        { kind: 'object', name: 'Household', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [{ name: 'householdId', type: { kind: 'ref', typeName: 'Household' } }],
        },
      ],
    });

    expect(doc.schemas.find((entry) => entry.name === 'Recipe')?.schema).toMatchObject({
      properties: {
        householdId: { type: 'string', description: 'Household id' },
      },
    });
  });

  it('omits fields that are not writable by agents from structured output schemas', () => {
    const doc = emitStructuredOutputSchemas({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'AccessDecision',
          fields: [
            { name: 'workspaceId', type: { kind: 'string' } },
            {
              name: 'canAccess',
              type: { kind: 'boolean' },
              derivation: {
                kind: 'computed',
                owner: 'backend',
                writableBy: ['backend'],
                sources: ['workspaceId'],
                refresh: 'onRead',
              },
            },
          ],
        },
      ],
    });

    expect(doc.schemas[0]?.schema).toMatchObject({
      properties: {
        workspaceId: { type: 'string' },
      },
      required: ['workspaceId'],
    });
    expect(JSON.stringify(doc.schemas[0]?.schema)).not.toContain('canAccess');
  });
});
