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
});
