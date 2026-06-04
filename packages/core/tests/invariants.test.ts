import { describe, expect, it } from 'vitest';
import { emit as emitJsonSchema } from '../src/emit-json-schema';
import { emit as emitZod } from '../src/emit-zod';
import type { Schema } from '../src/ir';
import { IRSchema } from '../src/ir';
import { apply } from '../src/ops';
import { checkSemantic, type StdlibCatalog } from '../src/semantic-validation';

const commonStdlib: StdlibCatalog = {
  namespaces: ['common'],
  hasType: (namespace, typeName) =>
    namespace === 'common' && (typeName === 'ISODate' || typeName === 'ISODateTime'),
};

const mealSchema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'MealBase',
      fields: [
        { name: 'date', type: { kind: 'date' } },
        { name: 'slot', type: { kind: 'string' } },
      ],
    },
    {
      kind: 'object',
      name: 'RecipeMeal',
      extends: ['MealBase'],
      fields: [
        { name: 'kind', type: { kind: 'literal', value: 'recipe' } },
        { name: 'recipeId', type: { kind: 'string' } },
      ],
    },
    {
      kind: 'object',
      name: 'MealPlan',
      fields: [
        { name: 'weekStartDate', type: { kind: 'date' } },
        {
          name: 'meals',
          type: { kind: 'array', element: { kind: 'ref', typeName: 'RecipeMeal' } },
        },
      ],
      invariants: [
        {
          kind: 'fieldPredicate',
          name: 'week_starts_on_monday',
          field: 'weekStartDate',
          predicate: { kind: 'weekday', value: 'monday' },
        },
        {
          kind: 'uniqueInArray',
          name: 'recipe_booked_once',
          arrayField: 'meals',
          uniqueField: 'recipeId',
        },
      ],
    },
  ],
};

describe('object invariants and composition', () => {
  it('accepts object extends and invariant metadata in the IR', () => {
    expect(IRSchema.safeParse(mealSchema).success).toBe(true);
    expect(checkSemantic(mealSchema)).toEqual([]);
  });

  it('validates inherited field references and invariant field references semantically', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'enum', name: 'Status', values: [{ value: 'draft' }] },
        {
          kind: 'object',
          name: 'Child',
          extends: ['MissingBase', 'Status'],
          fields: [{ name: 'name', type: { kind: 'string' } }],
          invariants: [
            {
              kind: 'fieldPredicate',
              name: 'trimmed',
              field: 'missing',
              predicate: { kind: 'nonEmptyTrimmedString' },
            },
          ],
        },
      ],
    };

    expect(checkSemantic(schema).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'object_extends_not_found',
        'object_extends_non_object',
        'invariant_unknown_field',
      ]),
    );
  });

  it('mutates invariants through closed-world ops', () => {
    const start: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      types: [
        {
          kind: 'object',
          name: 'Contact',
          fields: [
            { name: 'email', type: { kind: 'string' }, optional: true },
            { name: 'phone', type: { kind: 'string' }, optional: true },
          ],
        },
      ],
    };

    const added = apply(start, {
      kind: 'add_invariant',
      typeName: 'Contact',
      invariant: { kind: 'exactlyOneOf', name: 'one_contact_method', fields: ['email', 'phone'] },
    });
    expect('schema' in added).toBe(true);
    if (!('schema' in added)) return;
    expect(added.schema.types[0]).toMatchObject({
      invariants: [{ name: 'one_contact_method' }],
    });

    const renamed = apply(added.schema, {
      kind: 'update_field',
      typeName: 'Contact',
      fieldName: 'phone',
      patch: { name: 'mobile' },
    });
    expect('schema' in renamed).toBe(true);
    if (!('schema' in renamed)) return;
    expect(renamed.schema.types[0]).toMatchObject({
      invariants: [{ fields: ['email', 'mobile'] }],
    });

    const removed = apply(renamed.schema, {
      kind: 'remove_invariant',
      typeName: 'Contact',
      name: 'one_contact_method',
    });
    expect('schema' in removed).toBe(true);
    if ('schema' in removed) {
      expect(removed.schema.types[0]).not.toHaveProperty('invariants');
    }
  });

  it('supports same-object field comparison invariants through ops and emitters', () => {
    const start: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Batch',
          fields: [
            { name: 'acquiredDate', type: { kind: 'ref', typeName: 'common.ISODate' } },
            { name: 'expiryDate', type: { kind: 'ref', typeName: 'common.ISODate' } },
          ],
        },
      ],
    };

    const added = apply(start, {
      kind: 'add_invariant',
      typeName: 'Batch',
      invariant: {
        kind: 'fieldComparison',
        name: 'expiry_after_acquired',
        left: 'expiryDate',
        operator: '>=',
        right: 'acquiredDate',
      },
    });

    expect('schema' in added).toBe(true);
    if (!('schema' in added)) return;
    expect(checkSemantic(added.schema, commonStdlib)).toEqual([]);

    const renamed = apply(added.schema, {
      kind: 'update_field',
      typeName: 'Batch',
      fieldName: 'expiryDate',
      patch: { name: 'expiresOn' },
    });
    expect('schema' in renamed).toBe(true);
    if (!('schema' in renamed)) return;
    expect(renamed.schema.types[0]).toMatchObject({
      invariants: [{ left: 'expiresOn', right: 'acquiredDate' }],
    });

    const zodSource = emitZod(renamed.schema, 'batch.contexture.json');
    expect(zodSource).toContain('leftComparable >= rightComparable');

    const jsonSchema = emitJsonSchema(renamed.schema) as {
      $defs: Record<string, Record<string, unknown>>;
    };
    expect(jsonSchema.$defs.Batch?.['x-contexture-invariants']).toEqual([
      {
        kind: 'fieldComparison',
        name: 'expiry_after_acquired',
        left: 'expiresOn',
        operator: '>=',
        right: 'acquiredDate',
      },
    ]);
  });

  it('rejects field comparison invariants that reference missing fields', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      types: [
        {
          kind: 'object',
          name: 'Batch',
          fields: [{ name: 'acquiredDate', type: { kind: 'ref', typeName: 'common.ISODate' } }],
          invariants: [
            {
              kind: 'fieldComparison',
              name: 'expiry_after_acquired',
              left: 'expiryDate',
              operator: '>=',
              right: 'acquiredDate',
            },
          ],
        },
      ],
    };

    expect(checkSemantic(schema).map((issue) => issue.code)).toContain('invariant_unknown_field');
  });

  it('rejects field comparison invariants across incompatible primitive types', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/common', alias: 'common' }],
      types: [
        {
          kind: 'object',
          name: 'Batch',
          fields: [
            { name: 'quantity', type: { kind: 'number' } },
            { name: 'expiresOn', type: { kind: 'ref', typeName: 'common.ISODate' } },
          ],
          invariants: [
            {
              kind: 'fieldComparison',
              name: 'quantity_after_expiry',
              left: 'quantity',
              operator: '>=',
              right: 'expiresOn',
            },
          ],
        },
      ],
    };

    expect(checkSemantic(schema).map((issue) => issue.message)).toEqual([
      'Invariant "quantity_after_expiry" compares incompatible fields "quantity" and "expiresOn" on "Batch".',
    ]);
  });

  it('emits inherited fields and Zod refinement checks', () => {
    const source = emitZod(mealSchema, 'meal.contexture.json');

    expect(source).toContain('export const RecipeMeal = z.object({');
    expect(source).toContain('date: z.number(),');
    expect(source).toContain('recipeId: z.string(),');
    expect(source).toContain('.superRefine((value, ctx) => {');
    expect(source).toContain('week_starts_on_monday');
    expect(source).toContain('recipe_booked_once');
  });

  it('emits JSON Schema invariant metadata and native allOf constraints', () => {
    const schema = emitJsonSchema({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Contact',
          fields: [
            { name: 'email', type: { kind: 'string' }, optional: true },
            { name: 'phone', type: { kind: 'string' }, optional: true },
          ],
          invariants: [
            { kind: 'exactlyOneOf', name: 'one_contact_method', fields: ['email', 'phone'] },
          ],
        },
      ],
    }) as { $defs: Record<string, Record<string, unknown>> };

    const contact = schema.$defs.Contact;
    expect(contact).toBeDefined();
    if (!contact) return;

    expect(contact['x-contexture-invariants']).toEqual([
      { kind: 'exactlyOneOf', name: 'one_contact_method', fields: ['email', 'phone'] },
    ]);
    expect(contact.allOf).toEqual([{ oneOf: [{ required: ['email'] }, { required: ['phone'] }] }]);
  });
});
