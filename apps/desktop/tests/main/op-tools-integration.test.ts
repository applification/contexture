/**
 * Synthetic integration test: wire the main-side op tool factory to a
 * live renderer store via a direct function bridge (no electron).
 * Proves that when Claude invokes an op tool, the renderer state
 * converges as expected and the SDK sees the result.
 */

import { syncTurnContextAfterForwardOp, TurnContext } from '@main/ipc/op-bridge';
import { createOpTools, type ForwardOp, type OpToolDescriptor } from '@main/ops';
import { createSchemaReadTools } from '@main/providers/schema-read-tools';
import { createContextureStore } from '@renderer/store/contexture';
import { describe, expect, it } from 'vitest';

function toolNamed(tools: OpToolDescriptor[], name: string): OpToolDescriptor {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool: ${name}`);
  return t;
}

describe('op tools → renderer store (synthetic integration)', () => {
  it('runs a chat turn of add_type + add_field and converges the renderer IR', async () => {
    const store = createContextureStore({ version: '1', types: [] });
    const forward: ForwardOp = async (op) => store.getState().apply(op);
    const tools = createOpTools(forward);

    const addType = toolNamed(tools, 'add_type');
    const addField = toolNamed(tools, 'add_field');

    const r1 = await addType.handler({
      payload: { kind: 'object', name: 'Plot', fields: [] },
    });
    expect(r1).toMatchObject({ schema: expect.any(Object) });

    const r2 = await addField.handler({
      typeName: 'Plot',
      field: { name: 'area', type: { kind: 'number' } },
    });
    expect(r2).toMatchObject({ schema: expect.any(Object) });

    const finalIR = store.getState().schema;
    expect(finalIR.types).toHaveLength(1);
    const plot = finalIR.types[0];
    expect(plot.kind).toBe('object');
    if (plot.kind === 'object') {
      expect(plot.fields).toEqual([{ name: 'area', type: { kind: 'number' } }]);
    }
  });

  it('surfaces apply errors from the store back through the tool', async () => {
    const store = createContextureStore({ version: '1', types: [] });
    const forward: ForwardOp = async (op) => store.getState().apply(op);
    const tools = createOpTools(forward);
    const addField = toolNamed(tools, 'add_field');
    // No Plot type exists.
    const result = await addField.handler({
      typeName: 'Plot',
      field: { name: 'x', type: { kind: 'string' } },
    });
    expect(result).toMatchObject({ error: expect.any(String) });
    // Store unchanged.
    expect(store.getState().schema.types).toEqual([]);
  });

  it('keeps read tools in sync after a successful op in the same turn', async () => {
    const initialSchema = {
      version: '1',
      types: [{ kind: 'object', name: 'Post', fields: [] }],
    } as const;
    const store = createContextureStore(initialSchema);
    const turnContext = new TurnContext();
    turnContext.pushIR(initialSchema);
    const rawForward: ForwardOp = async (op) => store.getState().apply(op);
    const tools = [
      ...createSchemaReadTools(() => turnContext.current()),
      ...createOpTools(syncTurnContextAfterForwardOp(rawForward, turnContext)),
    ];

    const setTableFlag = toolNamed(tools, 'set_table_flag');
    const getType = toolNamed(tools, 'get_type');

    await expect(setTableFlag.handler({ typeName: 'Post', table: true })).resolves.toMatchObject({
      schema: expect.any(Object),
    });
    await expect(getType.handler({ typeName: 'Post' })).resolves.toMatchObject({
      found: true,
      type: expect.objectContaining({ name: 'Post', table: true }),
    });
  });
});
