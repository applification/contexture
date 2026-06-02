import { describe, expect, it } from 'vitest';
import {
  fixtureGeneratorById,
  generateFixtureValue,
  listFixtureGenerators,
  listFixtureModules,
} from '../src/fixture-generators';
import { IRSchema } from '../src/ir';

describe('fixture generator catalog', () => {
  it('discovers public Faker modules and generators from the installed package', () => {
    const modules = listFixtureModules();
    const moduleIds = modules.map((module) => module.id);

    expect(moduleIds).toContain('person');
    expect(moduleIds).toContain('internet');
    expect(moduleIds).toContain('food');
    expect(moduleIds).not.toContain('helpers');
    expect(moduleIds).not.toContain('rawDefinitions');

    expect(fixtureGeneratorById('person.fullName')).toMatchObject({
      id: 'person.fullName',
      label: 'Full name',
      module: 'person',
      valueType: 'string',
    });
    expect(fixtureGeneratorById('internet.email')).toMatchObject({
      label: 'Email address',
      valueType: 'string',
    });
  });

  it('filters generators by compatible value type', () => {
    const booleanGenerators = listFixtureGenerators({ valueType: 'boolean' });

    expect(booleanGenerators.map((generator) => generator.id)).toContain('datatype.boolean');
    expect(booleanGenerators.map((generator) => generator.id)).not.toContain('person.fullName');
  });

  it('can invoke a discovered generator', () => {
    expect(generateFixtureValue('food.ingredient')).toEqual(expect.any(String));
  });

  it('keeps sample-data hints in the Contexture IR', () => {
    const parsed = IRSchema.parse({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'User',
          fields: [
            {
              name: 'email',
              type: { kind: 'string' },
              sampleData: { generator: 'internet.email' },
            },
          ],
          sampleData: { category: 'person' },
        },
      ],
    });

    const [type] = parsed.types;
    expect(type?.kind).toBe('object');
    if (type?.kind !== 'object') return;
    expect(type.sampleData).toEqual({ category: 'person' });
    expect(type.fields[0]?.sampleData).toEqual({ generator: 'internet.email' });
  });
});
