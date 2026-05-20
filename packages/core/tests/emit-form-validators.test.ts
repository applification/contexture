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
});
