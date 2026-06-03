import { createOpTools, type ForwardOp, type OpToolDescriptor } from '@main/ops';
import type { Op } from '@renderer/store/ops';
import { describe, expect, it, vi } from 'vitest';

function makeTools(forward?: ForwardOp) {
  const spy = vi.fn(async (): Promise<{ ok: true }> => ({ ok: true }));
  const fwd = forward ?? (spy as unknown as ForwardOp);
  return { tools: createOpTools(fwd), spy };
}

function toolNamed(tools: OpToolDescriptor[], name: string): OpToolDescriptor {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool: ${name}`);
  return t;
}

describe('createOpTools', () => {
  it('registers one SDK tool per op (22 total)', () => {
    const { tools } = makeTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'add_field',
        'add_import',
        'add_index',
        'add_type',
        'add_value',
        'add_variant',
        'delete_type',
        'remove_field',
        'remove_import',
        'remove_import_at',
        'remove_index',
        'remove_value',
        'remove_variant',
        'rename_type',
        'reorder_fields',
        'replace_schema',
        'set_discriminator',
        'set_table_flag',
        'update_field',
        'update_index',
        'update_type',
        'update_value',
      ].sort(),
    );
  });

  it('set_table_flag forwards a strict Op', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'set_table_flag');
    await tool.handler({ typeName: 'Post', table: true });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'set_table_flag',
      typeName: 'Post',
      table: true,
    });
  });

  it('set_table_flag rejects malformed input', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'set_table_flag');
    await expect(tool.handler({ typeName: '', table: true })).rejects.toThrow();
    await expect(tool.handler({ typeName: 'Post', table: 'yes' })).rejects.toThrow();
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('add_index forwards a strict Op with index payload', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'add_index');
    await tool.handler({
      typeName: 'Post',
      index: { name: 'by_author', fields: ['author'] },
    });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'add_index',
      typeName: 'Post',
      index: { name: 'by_author', fields: ['author'] },
    });
  });

  it('add_index rejects an empty fields array at the tool boundary', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'add_index');
    await expect(
      tool.handler({ typeName: 'Post', index: { name: 'x', fields: [] } }),
    ).rejects.toThrow();
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('remove_index forwards a strict Op', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'remove_index');
    await tool.handler({ typeName: 'Post', name: 'by_author' });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'remove_index',
      typeName: 'Post',
      name: 'by_author',
    });
  });

  it('update_index forwards a strict Op with partial patch', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'update_index');
    await tool.handler({
      typeName: 'Post',
      name: 'by_author',
      patch: { fields: ['author', 'title'] },
    });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'update_index',
      typeName: 'Post',
      name: 'by_author',
      patch: { fields: ['author', 'title'] },
    });
  });

  it('add_field forwards a strict, well-typed Op to the renderer', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addField = toolNamed(tools, 'add_field');

    const result = await addField.handler({
      typeName: 'Plot',
      field: { name: 'area', type: { kind: 'number' } },
    });

    expect(forwardSpy).toHaveBeenCalledOnce();
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'add_field',
      typeName: 'Plot',
      field: { name: 'area', type: { kind: 'number' } },
    });
    expect(result).toEqual({ ok: true });
  });

  it('add_field forwards relationship metadata on ref field types', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addField = toolNamed(tools, 'add_field');

    await addField.handler({
      typeName: 'MealPlanMeal',
      field: {
        name: 'recipeId',
        type: {
          kind: 'ref',
          typeName: 'Recipe',
          relationship: {
            onDelete: 'cascade',
            ownership: { scopeField: 'householdId' },
          },
        },
      },
    });

    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'add_field',
      typeName: 'MealPlanMeal',
      field: {
        name: 'recipeId',
        type: {
          kind: 'ref',
          typeName: 'Recipe',
          relationship: {
            onDelete: 'cascade',
            ownership: { scopeField: 'householdId' },
          },
        },
      },
    });
  });

  it('add_field forwards explicit cross-scope relationship opt-outs', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addField = toolNamed(tools, 'add_field');

    await addField.handler({
      typeName: 'MealPlanMeal',
      field: {
        name: 'sharedRecipeId',
        type: {
          kind: 'ref',
          typeName: 'Recipe',
          relationship: { crossScope: true },
        },
      },
    });

    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'add_field',
      typeName: 'MealPlanMeal',
      field: {
        name: 'sharedRecipeId',
        type: {
          kind: 'ref',
          typeName: 'Recipe',
          relationship: { crossScope: true },
        },
      },
    });
  });

  it('add_field rejects malformed input before reaching the forwarder', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addField = toolNamed(tools, 'add_field');

    await expect(
      addField.handler({
        typeName: '', // strict: min(1) — must reject
        field: { name: 'x', type: { kind: 'number' } },
      }),
    ).rejects.toThrow();
    await expect(
      addField.handler({
        typeName: 'Plot',
        field: { name: 'x', type: { kind: 'wat' } }, // bogus field type
      }),
    ).rejects.toThrow();
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('update_field forwards relationship metadata inside type patches', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const updateField = toolNamed(tools, 'update_field');

    await updateField.handler({
      typeName: 'MealPlanMeal',
      fieldName: 'recipeId',
      patch: {
        type: {
          kind: 'ref',
          typeName: 'Recipe',
          relationship: {
            onDelete: 'restrict',
            ownership: { scopeField: 'householdId', targetScopeField: 'householdId' },
          },
        },
      },
    });

    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'update_field',
      typeName: 'MealPlanMeal',
      fieldName: 'recipeId',
      patch: {
        type: {
          kind: 'ref',
          typeName: 'Recipe',
          relationship: {
            onDelete: 'restrict',
            ownership: { scopeField: 'householdId', targetScopeField: 'householdId' },
          },
        },
      },
    });
  });

  it('update_field forwards derivation policy patches', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const updateField = toolNamed(tools, 'update_field');

    await updateField.handler({
      typeName: 'Recipe',
      fieldName: 'nutrition',
      patch: {
        derivation: {
          kind: 'computed',
          sources: ['ingredients[].grams', 'Ingredient.calories'],
          refresh: 'onWrite',
          driftPolicy: 'mustMatch',
          owner: 'backend',
          writableBy: ['backend'],
        },
        serverDerived: true,
      },
    });

    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'update_field',
      typeName: 'Recipe',
      fieldName: 'nutrition',
      patch: {
        derivation: {
          kind: 'computed',
          sources: ['ingredients[].grams', 'Ingredient.calories'],
          refresh: 'onWrite',
          driftPolicy: 'mustMatch',
          owner: 'backend',
          writableBy: ['backend'],
        },
        serverDerived: true,
      },
    });
  });

  it('add_type lenient tool accepts a valid TypeDef payload and forwards the op', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addType = toolNamed(tools, 'add_type');

    await addType.handler({
      payload: { kind: 'enum', name: 'Season', values: [{ value: 'spring' }] },
    });

    expect(forwardSpy).toHaveBeenCalledOnce();
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'add_type',
      type: { kind: 'enum', name: 'Season', values: [{ value: 'spring' }] },
    });
  });

  it('add_type accepts bare and core-op-style TypeDef envelopes', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addType = toolNamed(tools, 'add_type');
    const typeDef = { kind: 'enum', name: 'Season', values: [{ value: 'spring' }] };

    await addType.handler(typeDef);
    await addType.handler({ type: typeDef });
    await addType.handler({ payload: { type: typeDef } });

    expect(forwardSpy.mock.calls.map((call) => call[0])).toEqual([
      { kind: 'add_type', type: typeDef },
      { kind: 'add_type', type: typeDef },
      { kind: 'add_type', type: typeDef },
    ]);
  });

  it('add_type description distinguishes typed input from apply_contexture_op input', () => {
    const { tools } = makeTools();
    const addType = toolNamed(tools, 'add_type');

    expect(addType.description).toContain('{ payload: TypeDef }');
    expect(addType.description).toContain('apply_contexture_op');
    expect(addType.description).toContain('{ kind: "add_type", type: TypeDef }');
  });

  it('add_type rejects a payload that fails the IR meta-schema', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addType = toolNamed(tools, 'add_type');

    await expect(addType.handler({ payload: { kind: 'bogus', name: 'X' } })).rejects.toThrow(
      /add_type/i,
    );
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('add_import accepts payload and core-op-style import envelopes', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addImport = toolNamed(tools, 'add_import');
    const importDecl = { kind: 'stdlib', path: '@contexture/place', alias: 'place' };

    await addImport.handler({ payload: importDecl });
    await addImport.handler({ import: importDecl });

    expect(forwardSpy.mock.calls.map((call) => call[0])).toEqual([
      { kind: 'add_import', import: importDecl },
      { kind: 'add_import', import: importDecl },
    ]);
  });

  it('update_type rejects patches that try to change identity', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const updateType = toolNamed(tools, 'update_type');

    await expect(
      updateType.handler({ payload: { name: 'Post', patch: { name: 'Article' } } }),
    ).rejects.toThrow(/rename_type/);
    await expect(
      updateType.handler({ payload: { name: 'Post', patch: { kind: 'raw' } } }),
    ).rejects.toThrow(/replace_schema/);
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('replace_schema accepts a valid IR and forwards the whole Schema', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const replace = toolNamed(tools, 'replace_schema');

    const schema = { version: '1', types: [{ kind: 'object', name: 'X', fields: [] }] };
    await replace.handler({ schema });

    expect(forwardSpy).toHaveBeenCalledOnce();
    const forwardedOp = forwardSpy.mock.calls[0][0];
    expect(forwardedOp.kind).toBe('replace_schema');
    expect((forwardedOp as { schema: unknown }).schema).toEqual(schema);
  });

  it('replace_schema accepts Claude-style payload and direct schema shapes', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const replace = toolNamed(tools, 'replace_schema');
    const schema = { version: '1', types: [{ kind: 'object', name: 'X', fields: [] }] };

    await replace.handler({ payload: schema });
    await replace.handler(schema);
    await replace.handler({ payload: JSON.stringify(schema) });

    expect(forwardSpy.mock.calls.map((call) => call[0])).toEqual([
      { kind: 'replace_schema', schema },
      { kind: 'replace_schema', schema },
      { kind: 'replace_schema', schema },
    ]);
  });

  it('replace_schema rejects an invalid IR before forwarding', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const replace = toolNamed(tools, 'replace_schema');

    await expect(
      replace.handler({ schema: { version: '1', types: [{ kind: 'bogus' }] } }),
    ).rejects.toThrow(/replace_schema/i);
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('add_value forwards a strict Op', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'add_value');
    await tool.handler({ typeName: 'Role', value: 'viewer' });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'add_value',
      typeName: 'Role',
      value: 'viewer',
    });
  });

  it('add_value rejects empty typeName or value', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'add_value');
    await expect(tool.handler({ typeName: '', value: 'viewer' })).rejects.toThrow();
    await expect(tool.handler({ typeName: 'Role', value: '' })).rejects.toThrow();
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('update_value forwards a strict Op with patch', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'update_value');
    await tool.handler({ typeName: 'Role', value: 'admin', patch: { description: 'Full access' } });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'update_value',
      typeName: 'Role',
      value: 'admin',
      patch: { description: 'Full access' },
    });
  });

  it('remove_value forwards a strict Op', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'remove_value');
    await tool.handler({ typeName: 'Role', value: 'admin' });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'remove_value',
      typeName: 'Role',
      value: 'admin',
    });
  });

  it('remove_variant forwards a strict Op', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'remove_variant');
    await tool.handler({ typeName: 'Event', variant: 'Signup' });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'remove_variant',
      typeName: 'Event',
      variant: 'Signup',
    });
  });

  it('remove_import_at forwards a strict Op', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'remove_import_at');
    await tool.handler({ index: 1 });
    expect(forwardSpy.mock.calls[0][0]).toEqual({
      kind: 'remove_import_at',
      index: 1,
    });
    await expect(tool.handler({ index: -1 })).rejects.toThrow();
  });

  it('delete_type accepts top-level and payload-wrapped Claude shapes', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const tool = toolNamed(tools, 'delete_type');

    await tool.handler({ name: 'SaleLineItem' });
    await tool.handler({ payload: { name: 'SaleLineItem' } });
    await tool.handler({ payload: JSON.stringify({ name: 'SaleLineItem' }) });

    expect(forwardSpy.mock.calls.map((call) => call[0])).toEqual([
      { kind: 'delete_type', name: 'SaleLineItem' },
      { kind: 'delete_type', name: 'SaleLineItem' },
      { kind: 'delete_type', name: 'SaleLineItem' },
    ]);
  });

  it('propagates ApplyResult errors back to the SDK caller', async () => {
    const forward: ForwardOp = async () => ({ error: 'type not found' });
    const { tools } = makeTools(forward);
    const rename = toolNamed(tools, 'rename_type');
    const result = await rename.handler({ payload: { from: 'A', to: 'B' } });
    expect(result).toEqual({ error: 'type not found' });
  });
});
