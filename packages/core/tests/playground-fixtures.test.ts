import { describe, expect, it } from 'vitest';
import type { Schema } from '../src/ir';
import { generatePlaygroundFixtures } from '../src/playground-fixtures';

const todoSchema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'TodoItem',
      table: true,
      fields: [
        { name: 'listId', type: { kind: 'ref', typeName: 'TodoList' } },
        { name: 'assigneeId', type: { kind: 'ref', typeName: 'User' } },
        { name: 'title', type: { kind: 'string', min: 3 } },
        { name: 'notes', type: { kind: 'string' }, optional: true },
        { name: 'status', type: { kind: 'ref', typeName: 'TodoStatus' } },
        { name: 'priority', type: { kind: 'ref', typeName: 'Priority' } },
        { name: 'dueAt', type: { kind: 'date' }, optional: true },
        { name: 'createdAt', type: { kind: 'date' }, serverDerived: true },
      ],
    },
    {
      kind: 'object',
      name: 'User',
      table: true,
      fields: [
        { name: 'name', type: { kind: 'string' } },
        { name: 'email', type: { kind: 'string', format: 'email' } },
      ],
    },
    {
      kind: 'object',
      name: 'TodoList',
      table: true,
      fields: [
        { name: 'title', type: { kind: 'string' } },
        { name: 'ownerId', type: { kind: 'ref', typeName: 'User' } },
      ],
    },
    {
      kind: 'enum',
      name: 'TodoStatus',
      values: [{ value: 'todo' }, { value: 'doing' }, { value: 'done' }],
    },
    {
      kind: 'enum',
      name: 'Priority',
      values: [{ value: 'low' }, { value: 'normal' }, { value: 'high' }],
    },
  ],
};

const pantrySchema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Household',
      table: true,
      fields: [{ name: 'name', type: { kind: 'string' } }],
    },
    {
      kind: 'object',
      name: 'PantryItem',
      description: 'A pantry item owned by a Household.',
      table: true,
      fields: [
        { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
        { name: 'name', type: { kind: 'string' } },
        { name: 'quantity', type: { kind: 'number' } },
        { name: 'unit', type: { kind: 'string' } },
        { name: 'storageLocation', type: { kind: 'string' } },
        { name: 'notes', type: { kind: 'string' }, optional: true },
      ],
    },
    {
      kind: 'object',
      name: 'Recipe',
      table: true,
      fields: [
        { name: 'name', type: { kind: 'string' } },
        { name: 'description', type: { kind: 'string' }, optional: true },
      ],
    },
    {
      kind: 'object',
      name: 'ShoppingListItem',
      description: 'A food item the household plans to buy.',
      table: true,
      fields: [
        { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
        { name: 'name', type: { kind: 'string' } },
        { name: 'quantity', type: { kind: 'number' } },
        { name: 'unit', type: { kind: 'string' } },
        { name: 'purchased', type: { kind: 'boolean' } },
      ],
    },
    {
      kind: 'object',
      name: 'Product',
      table: true,
      fields: [
        { name: 'name', type: { kind: 'string' } },
        { name: 'description', type: { kind: 'string' } },
        { name: 'price', type: { kind: 'string' } },
      ],
    },
    {
      kind: 'object',
      name: 'Account',
      table: true,
      sampleData: { category: 'person' },
      fields: [
        { name: 'name', type: { kind: 'string' } },
        { name: 'contact', type: { kind: 'string' }, sampleData: { generator: 'internet.email' } },
      ],
    },
  ],
};

describe('generatePlaygroundFixtures', () => {
  it('generates dependency-aware table records with valid refs and semantic values', () => {
    const result = generatePlaygroundFixtures(todoSchema, {
      seed: 'todo-demo',
      countsByType: { User: 3, TodoList: 2, TodoItem: 5 },
    });

    expect(result.warnings).toEqual([]);
    expect(result.recordsByType.User).toHaveLength(3);
    expect(result.recordsByType.TodoList).toHaveLength(2);
    expect(result.recordsByType.TodoItem).toHaveLength(5);

    const userIds = new Set(result.recordsByType.User?.map((record) => record.id));
    const listIds = new Set(result.recordsByType.TodoList?.map((record) => record.id));
    const [user] = result.recordsByType.User ?? [];
    const [list] = result.recordsByType.TodoList ?? [];
    const [item] = result.recordsByType.TodoItem ?? [];

    expect(user?.value.email).toEqual(expect.stringMatching(/@/));
    expect(list?.value.ownerId).toSatisfy(
      (id: unknown) => typeof id === 'string' && userIds.has(id),
    );
    expect(item?.value.listId).toSatisfy(
      (id: unknown) => typeof id === 'string' && listIds.has(id),
    );
    expect(item?.value.assigneeId).toSatisfy(
      (id: unknown) => typeof id === 'string' && userIds.has(id),
    );
    expect(item?.value.createdAt).toBeUndefined();
    expect(['todo', 'doing', 'done']).toContain(item?.value.status);
  });

  it('supports scoped generation for the current entity using existing refs', () => {
    const usersAndLists = generatePlaygroundFixtures(todoSchema, {
      seed: 'base',
      typeNames: ['User', 'TodoList'],
      count: 2,
    });
    const items = generatePlaygroundFixtures(todoSchema, {
      seed: 'items',
      typeNames: ['TodoItem'],
      count: 4,
      existingRecordsByType: usersAndLists.recordsByType,
    });

    expect(items.warnings).toEqual([]);
    expect(items.recordsByType.TodoItem).toHaveLength(4);
  });

  it('warns when required refs cannot be resolved', () => {
    const result = generatePlaygroundFixtures(todoSchema, {
      seed: 'items-only',
      typeNames: ['TodoItem'],
      count: 1,
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          typeName: 'TodoItem',
          fieldName: 'listId',
        }),
      ]),
    );
  });

  it('uses entity-aware semantics for pantry and household records', () => {
    const result = generatePlaygroundFixtures(pantrySchema, {
      seed: 'pantry-demo',
      countsByType: { Household: 1, PantryItem: 3, Recipe: 2 },
    });

    const household = result.recordsByType.Household?.[0];
    const pantryItem = result.recordsByType.PantryItem?.[0];
    const recipe = result.recordsByType.Recipe?.[0];
    const shoppingListItem = result.recordsByType.ShoppingListItem?.[0];
    const product = result.recordsByType.Product?.[0];
    const account = result.recordsByType.Account?.[0];

    expect(result.warnings).toEqual([]);
    expect(household?.value.name).toMatch(/^The .+ Household$/);
    expect(pantryItem?.value.name).toEqual(expect.any(String));
    expect(pantryItem?.value.name).not.toMatch(/Household$/);
    expect(pantryItem?.value.quantity).toSatisfy(
      (value: unknown) => typeof value === 'number' && value >= 1 && value <= 12,
    );
    expect(['kg', 'g', 'ml', 'jar', 'tin', 'pack']).toContain(pantryItem?.value.unit);
    expect(['Pantry', 'Fridge', 'Freezer', 'Cupboard', 'Allotment shed']).toContain(
      pantryItem?.value.storageLocation,
    );
    expect(recipe?.value.name).toEqual(expect.any(String));
    expect(recipe?.value.name).not.toMatch(/^The .+ Household$/);
    expect(shoppingListItem?.value.name).toEqual(expect.any(String));
    expect(shoppingListItem?.value.name).not.toMatch(/Household$/);
    expect(shoppingListItem?.value.quantity).toSatisfy(
      (value: unknown) => typeof value === 'number' && value >= 1 && value <= 12,
    );
    expect(['kg', 'g', 'ml', 'jar', 'tin', 'pack']).toContain(shoppingListItem?.value.unit);
    expect(product?.value.name).toEqual(expect.any(String));
    expect(product?.value.description).toEqual(expect.any(String));
    expect(product?.value.price).toEqual(expect.stringMatching(/^\d+\.\d{2}$/));
    expect(account?.value.name).toEqual(expect.any(String));
    expect(account?.value.name).not.toMatch(/Household$/);
    expect(account?.value.contact).toEqual(expect.stringMatching(/@/));
  });
});
