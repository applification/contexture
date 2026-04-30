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
  it('registers one SDK tool per op (20 total)', () => {
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
        'remove_index',
        'remove_value',
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

  it('add_type rejects a payload that fails the IR meta-schema', async () => {
    const forwardSpy = vi.fn(async (_op: Op) => ({ ok: true }) as const);
    const { tools } = makeTools(forwardSpy as unknown as ForwardOp);
    const addType = toolNamed(tools, 'add_type');

    await expect(addType.handler({ payload: { kind: 'bogus', name: 'X' } })).rejects.toThrow(
      /add_type/i,
    );
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

  it('propagates ApplyResult errors back to the SDK caller', async () => {
    const forward: ForwardOp = async () => ({ error: 'type not found' });
    const { tools } = makeTools(forward);
    const rename = toolNamed(tools, 'rename_type');
    const result = await rename.handler({ payload: { from: 'A', to: 'B' } });
    expect(result).toEqual({ error: 'type not found' });
  });
});
