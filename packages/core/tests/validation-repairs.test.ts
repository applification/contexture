import { describe, expect, it } from 'vitest';
import type { Schema } from '../src/ir';
import { apply } from '../src/ops';
import { checkSemantic } from '../src/semantic-validation';
import { repairForValidationError } from '../src/validation-repairs';

function repairFirstIssue(schema: Schema) {
  const issue = checkSemantic(schema)[0];
  if (!issue) return null;
  return repairForValidationError(schema, issue);
}

describe('validation repairs', () => {
  it('plans core repair ops that resolve supported semantic issues', () => {
    const schema: Schema = {
      version: '1',
      types: [{ kind: 'enum', name: 'Role', values: [] }],
    };

    const repair = repairFirstIssue(schema);
    expect(repair?.op).toEqual({ kind: 'add_value', typeName: 'Role', value: 'value' });

    const result = apply(schema, repair?.op ?? { kind: 'replace_schema', schema });
    expect(result).toHaveProperty('schema');
    if ('schema' in result) expect(checkSemantic(result.schema)).toEqual([]);
  });

  it('does not offer duplicate field repairs until ops can target fields by index', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [
            { name: 'slug', type: { kind: 'string' } },
            { name: 'slug', type: { kind: 'string' } },
          ],
        },
      ],
    };

    const issue = checkSemantic(schema).find(
      (candidate) => candidate.code === 'duplicate_field_name',
    );
    expect(issue).toBeDefined();
    expect(issue ? repairForValidationError(schema, issue) : null).toBeNull();
  });

  it('does not offer duplicate enum value repairs until ops can target values by index', () => {
    const schema: Schema = {
      version: '1',
      types: [{ kind: 'enum', name: 'Role', values: [{ value: 'admin' }, { value: 'admin' }] }],
    };

    const issue = checkSemantic(schema).find(
      (candidate) => candidate.code === 'enum_duplicate_value',
    );
    expect(issue).toBeDefined();
    expect(issue ? repairForValidationError(schema, issue) : null).toBeNull();
  });

  it('documents enum evolution compatibility for client-facing enum advisories', () => {
    const schema: Schema = {
      version: '1',
      metadata: { description: 'Mobile and web meal planning app.' },
      types: [
        { kind: 'enum', name: 'DietaryProfile', values: [{ value: 'vegan' }] },
        {
          kind: 'object',
          name: 'RecipeSafetyAssessment',
          table: true,
          fields: [
            {
              name: 'mergedDietaryProfiles',
              type: { kind: 'array', element: { kind: 'ref', typeName: 'DietaryProfile' } },
            },
          ],
        },
      ],
    };

    const issue = checkSemantic(schema).find(
      (candidate) => candidate.code === 'operational_enum_evolution',
    );
    const repair = issue ? repairForValidationError(schema, issue) : null;

    expect(repair).toMatchObject({
      label: 'Document contract',
      focusTypeName: 'DietaryProfile',
      op: {
        kind: 'update_type',
        name: 'DietaryProfile',
        patch: {
          compatibility: {
            enumEvolution: {
              unknownValueBehavior: 'preserve',
              fallbackLabel: 'Unknown dietary profile',
              clientSurfaces: ['web', 'mobile', 'api'],
              owner: 'client',
            },
          },
        },
      },
    });

    const result = apply(schema, repair?.op ?? { kind: 'replace_schema', schema });
    expect(result).toHaveProperty('schema');
    if ('schema' in result) {
      expect(checkSemantic(result.schema).map((candidate) => candidate.code)).not.toContain(
        'operational_enum_evolution',
      );
    }
  });
});
