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
  it('registers one SDK tool per op (13 total)', () => {
    const { tools } = makeTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'add_field',
        'add_import',
        'add_type',
        'add_variant',
        'delete_field',
        'delete_type',
        'remove_import',
        'rename_type',
        'reorder_fields',
        'replace_schema',
        'set_discriminator',
        'update_field',
        'update_type',
      ].sort(),
    );
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

  it('propagates ApplyResult errors back to the SDK caller', async () => {
    const forward: ForwardOp = async () => ({ error: 'type not found' });
    const { tools } = makeTools(forward);
    const rename = toolNamed(tools, 'rename_type');
    const result = await rename.handler({ payload: { from: 'A', to: 'B' } });
    expect(result).toEqual({ error: 'type not found' });
  });
});
