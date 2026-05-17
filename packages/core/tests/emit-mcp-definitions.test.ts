import { describe, expect, it } from 'vitest';
import { emitMcpDefinitions, type Schema } from '../src';

const schema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'HarvestEvent',
      fields: [
        { name: 'crop', type: { kind: 'string' } },
        { name: 'quantity', type: { kind: 'number' } },
      ],
    },
  ],
};

describe('emitMcpDefinitions', () => {
  it('emits MCP-style tool definitions backed by per-type input schemas', () => {
    const doc = emitMcpDefinitions(schema, '/repo/packages/contexture/allotment.contexture.json');

    expect(doc).toMatchObject({
      version: '1',
      $contexture_generated: expect.stringContaining('@contexture-generated'),
      tools: [
        {
          name: 'submit_harvest_event',
          description: 'Submit a HarvestEvent object.',
          inputSchema: {
            type: 'object',
            properties: {
              crop: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['crop', 'quantity'],
            additionalProperties: false,
          },
        },
      ],
    });
  });
});
