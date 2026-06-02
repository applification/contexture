import { describe, expect, it } from 'vitest';
import type { Schema } from '../src/ir';
import { buildPlaygroundContract, emptyEntityValue } from '../src/playground-contract';

const schema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Project',
      table: true,
      fields: [
        { name: 'name', type: { kind: 'string', min: 2 } },
        { name: 'status', type: { kind: 'ref', typeName: 'ProjectStatus' } },
        { name: 'owner', type: { kind: 'ref', typeName: 'Person' }, optional: true },
        { name: 'tasks', type: { kind: 'array', element: { kind: 'ref', typeName: 'Task' } } },
        { name: 'createdAt', type: { kind: 'date' }, serverDerived: true },
      ],
      indexes: [{ name: 'by_status', fields: ['status'] }],
    },
    {
      kind: 'object',
      name: 'Person',
      table: true,
      fields: [{ name: 'email', type: { kind: 'string', format: 'email' } }],
    },
    {
      kind: 'object',
      name: 'Task',
      fields: [
        { name: 'title', type: { kind: 'string' } },
        { name: 'done', type: { kind: 'boolean' }, default: false },
      ],
    },
    {
      kind: 'enum',
      name: 'ProjectStatus',
      values: [{ value: 'draft' }, { value: 'active' }],
    },
  ],
};

describe('buildPlaygroundContract', () => {
  it('maps table objects into playground entities with form controls', () => {
    const contract = buildPlaygroundContract(schema);

    expect(contract.entities).toHaveLength(2);
    expect(contract.entities[0]).toMatchObject({
      typeName: 'Project',
      tableName: 'project',
      indexes: ['by_status'],
      displayFieldName: 'name',
    });
    expect(contract.entities[0]?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'text',
          fieldName: 'name',
          required: true,
          constraints: expect.objectContaining({ min: 2 }),
        }),
        expect.objectContaining({
          kind: 'enum',
          fieldName: 'status',
          options: [
            { value: 'draft', label: 'Draft', description: undefined },
            { value: 'active', label: 'Active', description: undefined },
          ],
        }),
        expect.objectContaining({
          kind: 'ref',
          fieldName: 'owner',
          required: false,
          targetTypeName: 'Person',
        }),
        expect.objectContaining({
          kind: 'array',
          fieldName: 'tasks',
          element: expect.objectContaining({ kind: 'object', typeName: 'Task' }),
        }),
      ]),
    );
  });

  it('creates empty entity values without server-derived fields', () => {
    const [project] = buildPlaygroundContract(schema).entities;

    expect(project && emptyEntityValue(project)).toEqual({
      name: '',
      status: 'draft',
      tasks: [],
    });
  });

  it('does not recurse forever on embedded object cycles', () => {
    const recursive: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Tree',
          table: true,
          fields: [{ name: 'root', type: { kind: 'ref', typeName: 'Branch' } }],
        },
        {
          kind: 'object',
          name: 'Branch',
          fields: [{ name: 'child', type: { kind: 'ref', typeName: 'Branch' } }],
        },
      ],
    };

    const [tree] = buildPlaygroundContract(recursive).entities;
    const root = tree?.fields[0];

    expect(root).toMatchObject({
      kind: 'object',
      fieldName: 'root',
      fields: [
        expect.objectContaining({
          kind: 'unsupported',
          reason: 'Recursive embedded reference: Branch',
        }),
      ],
    });
  });

  it('resolves qualified external raw and enum references into editable controls', () => {
    const externalTypes = new Map([
      [
        'common.NonEmptyString',
        {
          kind: 'raw' as const,
          name: 'NonEmptyString',
          zod: 'z.string().min(1)',
          jsonSchema: { type: 'string', minLength: 1 },
        },
      ],
      [
        'place.CountryCode',
        {
          kind: 'enum' as const,
          name: 'CountryCode',
          values: [{ value: 'GB' }, { value: 'US' }],
        },
      ],
    ]);
    const recordLabelSchema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'RecordLabel',
          table: true,
          fields: [
            { name: 'name', type: { kind: 'ref', typeName: 'common.NonEmptyString' } },
            { name: 'country', type: { kind: 'ref', typeName: 'place.CountryCode' } },
          ],
        },
      ],
    };

    const [recordLabel] = buildPlaygroundContract(recordLabelSchema, { externalTypes }).entities;

    expect(recordLabel?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'text',
          fieldName: 'name',
          constraints: expect.objectContaining({ min: 1 }),
        }),
        expect.objectContaining({
          kind: 'enum',
          fieldName: 'country',
          options: [
            { value: 'GB', label: 'GB', description: undefined },
            { value: 'US', label: 'US', description: undefined },
          ],
        }),
      ]),
    );
  });
});
