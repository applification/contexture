/**
 * Integration: double-click on the pane → add_type op lands in the
 * app-wide undoable store.
 *
 * Exercises the full pipe a double-click triggers: the pure handler
 * produces an `add_type` op, and the store's `apply` reducer mutates
 * the schema accordingly. We skip the XYFlow layer in jsdom (the
 * library requires layout measurements that don't work in a headless
 * runtime) and call through the same dispatch path the React host
 * would.
 */
import { handleDoubleClick } from '@renderer/components/graph/interactions';
import { useUndoStore } from '@renderer/store/undo';
import { beforeEach, describe, expect, it } from 'vitest';

describe('double-click → add_type integration', () => {
  beforeEach(() => {
    // Reset the singleton so tests don't leak state.
    useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  });

  it('adds a fresh Type1 to the live schema', () => {
    const op = handleDoubleClick(useUndoStore.getState().schema);
    const result = useUndoStore.getState().apply(op);
    expect('schema' in result).toBe(true);
    const state = useUndoStore.getState().schema;
    expect(state.types).toEqual([{ kind: 'object', name: 'Type1', fields: [] }]);
  });

  it('adds Type2 on a second double-click without colliding with Type1', () => {
    useUndoStore.getState().apply(handleDoubleClick(useUndoStore.getState().schema));
    useUndoStore.getState().apply(handleDoubleClick(useUndoStore.getState().schema));
    expect(useUndoStore.getState().schema.types.map((t) => t.name)).toEqual(['Type1', 'Type2']);
  });

  it('each add_type lands as its own undo step so Cmd-Z reverses one', () => {
    useUndoStore.getState().apply(handleDoubleClick(useUndoStore.getState().schema));
    useUndoStore.getState().apply(handleDoubleClick(useUndoStore.getState().schema));
    useUndoStore.getState().undo();
    expect(useUndoStore.getState().schema.types.map((t) => t.name)).toEqual(['Type1']);
  });
});
