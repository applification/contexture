import { describe, expect, it } from 'vitest';
import { emitFormValidators, type Schema } from '../src';

const schema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'SignupForm',
      fields: [
        { name: 'email', type: { kind: 'string', format: 'email' } },
        { name: 'marketingOptIn', optional: true, type: { kind: 'boolean' } },
      ],
    },
    {
      kind: 'enum',
      name: 'Plan',
      values: [{ value: 'free' }, { value: 'pro' }],
    },
  ],
};

describe('emitFormValidators', () => {
  it('emits dependency-free validator helpers backed by generated Zod schemas', () => {
    const source = emitFormValidators(schema, 'signup', '/repo/packages/contexture/signup.json');

    expect(source).toContain('@contexture-generated');
    expect(source).toContain("import { Plan, SignupForm } from './signup.schema';");
    expect(source).toContain('export const SignupFormValidator = createFormValidator(SignupForm);');
    expect(source).toContain('export const PlanValidator = createFormValidator(Plan);');
    expect(source).toContain('safeParse');
  });

  it('emits create validators that omit server-derived fields', () => {
    const source = emitFormValidators(
      {
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Artwork',
            fields: [
              { name: 'title', type: { kind: 'string' } },
              { name: 'sourceSearchText', type: { kind: 'string' }, serverDerived: true },
            ],
          },
        ],
      },
      'artwork',
      '/repo/packages/contexture/artwork.json',
    );

    expect(source).toContain('export const ArtworkValidator = createFormValidator(Artwork);');
    expect(source).toContain(
      'export const ArtworkCreateValidator = createFormValidator(Artwork.omit({ sourceSearchText: true }));',
    );
  });

  it('emits create validators that omit backend-owned derivation fields', () => {
    const source = emitFormValidators(
      {
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Recipe',
            fields: [
              { name: 'title', type: { kind: 'string' } },
              {
                name: 'nutrition',
                type: { kind: 'string' },
                derivation: {
                  kind: 'computed',
                  owner: 'backend',
                  sources: ['ingredients[].grams'],
                  refresh: 'onWrite',
                },
              },
            ],
          },
        ],
      },
      'recipe',
    );

    expect(source).toContain(
      'export const RecipeCreateValidator = createFormValidator(Recipe.omit({ nutrition: true }));',
    );
  });

  it('emits create validators that omit fields not writable by clients', () => {
    const source = emitFormValidators(
      {
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Invoice',
            fields: [
              { name: 'lineItemCount', type: { kind: 'number', int: true } },
              {
                name: 'total',
                type: { kind: 'number' },
                derivation: {
                  kind: 'rollup',
                  owner: 'backend',
                  writableBy: ['backend'],
                  sources: ['lineItemCount'],
                  refresh: 'onWrite',
                },
              },
            ],
          },
        ],
      },
      'invoice',
    );

    expect(source).toContain(
      'export const InvoiceCreateValidator = createFormValidator(Invoice.omit({ total: true }));',
    );
  });
});
