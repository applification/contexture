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

  it('rejects generated tool name collisions', () => {
    const collidingSchema: Schema = {
      ...schema,
      types: [
        { kind: 'object', name: 'CustomerProfile', fields: [] },
        { kind: 'object', name: 'Customer_Profile', fields: [] },
      ],
    };

    expect(() => emitAiToolSchemas(collidingSchema)).toThrow(
      'AI tool schema name collision: "CustomerProfile" and "Customer_Profile" both emit "submit_customer_profile".',
    );
  });

  it('emits table refs as id strings in tool parameters', () => {
    const doc = emitAiToolSchemas({
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

    expect(doc.tools.find((tool) => tool.name === 'submit_recipe')?.parameters).toMatchObject({
      properties: {
        householdId: { type: 'string', description: 'Household id' },
      },
    });
  });

  it('omits fields that are not writable by agents from tool parameters', () => {
    const doc = emitAiToolSchemas({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'RecipeAssessment',
          fields: [
            { name: 'recipeId', type: { kind: 'string' } },
            {
              name: 'safetyVerdict',
              type: { kind: 'string' },
              derivation: {
                kind: 'computed',
                owner: 'backend',
                writableBy: ['backend'],
                sources: ['recipeId'],
                refresh: 'onRead',
              },
            },
          ],
        },
      ],
    });

    expect(doc.tools[0]?.parameters).toMatchObject({
      properties: {
        recipeId: { type: 'string' },
      },
      required: ['recipeId'],
    });
    expect(JSON.stringify(doc.tools[0]?.parameters)).not.toContain('safetyVerdict');
  });
});
