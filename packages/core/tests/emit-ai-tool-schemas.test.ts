import { describe, expect, it } from 'vitest';
import { emitAiToolSchemas, type Schema } from '../src';

const schema: Schema = {
  version: '1',
  metadata: { name: 'CRM' },
  types: [
    {
      kind: 'object',
      name: 'CustomerProfile',
      description: 'A customer record for intake.',
      fields: [
        { name: 'email', type: { kind: 'string', format: 'email' } },
        { name: 'company', optional: true, type: { kind: 'string' } },
      ],
    },
    {
      kind: 'enum',
      name: 'LeadStatus',
      values: [{ value: 'new' }, { value: 'qualified' }],
    },
  ],
};

describe('emitAiToolSchemas', () => {
  it('emits provider-neutral tool definitions backed by per-type JSON Schema', () => {
    const doc = emitAiToolSchemas(schema, '/repo/packages/contexture/crm.contexture.json');

    expect(doc).toMatchObject({
      version: '1',
      $contexture_generated: expect.stringContaining('@contexture-generated'),
      tools: [
        {
          name: 'submit_customer_profile',
          description: 'Submit a CustomerProfile: A customer record for intake.',
          parameters: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              company: { type: 'string' },
            },
            required: ['email'],
            additionalProperties: false,
          },
        },
        {
          name: 'submit_lead_status',
          description: 'Submit a LeadStatus object.',
          parameters: {
            type: 'string',
            enum: ['new', 'qualified'],
          },
        },
      ],
    });
  });
});
