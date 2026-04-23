import type { Schema } from '@renderer/model/types';
import { createUndoableContextureStore } from '@renderer/store/undo';
import { describe, expect, it } from 'vitest';

const empty: Schema = { version: '1', types: [] };

const addType = (name: string) =>
  ({ kind: 'add_type', type: { kind: 'object', name, fields: [] } }) as const;

describe('undoable contexture store', () => {
  it('starts with empty history; canUndo and canRedo are false', () => {
    const store = createUndoableContextureStore(empty);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(false);
  });

  it('single-op apply pushes exactly one undo entry', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().apply(addType('User'));
    expect(store.getState().canUndo).toBe(true);
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User']);
  });

  it('undo restores the previous schema; redo re-applies it', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().apply(addType('User'));
    store.getState().apply(addType('Post'));
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User', 'Post']);

    store.getState().undo();
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User']);
    store.getState().undo();
    expect(store.getState().schema.types).toEqual([]);
    expect(store.getState().canUndo).toBe(false);

    store.getState().redo();
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User']);
    store.getState().redo();
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User', 'Post']);
  });

  it('a new apply clears the redo stack', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().apply(addType('User'));
    store.getState().undo();
    expect(store.getState().canRedo).toBe(true);
    store.getState().apply(addType('Post'));
    expect(store.getState().canRedo).toBe(false);
  });

  it('begin/commit batches N ops into one undo entry', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().apply(addType('Seed'));
    store.getState().begin();
    store.getState().apply(addType('A'));
    store.getState().apply(addType('B'));
    store.getState().apply(addType('C'));
    store.getState().commit();

    // one undo restores the pre-begin snapshot, not just the last op.
    store.getState().undo();
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['Seed']);
    store.getState().redo();
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['Seed', 'A', 'B', 'C']);
  });

  it('rollback discards the transaction and restores the pre-begin state', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().apply(addType('Seed'));
    store.getState().begin();
    store.getState().apply(addType('A'));
    store.getState().apply(addType('B'));
    store.getState().rollback();

    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['Seed']);
    // rollback should not itself create an undo entry.
    store.getState().undo();
    expect(store.getState().schema.types).toEqual([]);
  });

  it('nested begin/commit is balanced by depth — only outermost commit lands an entry', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().apply(addType('Seed'));
    store.getState().begin();
    store.getState().apply(addType('A'));
    store.getState().begin(); // nested
    store.getState().apply(addType('B'));
    store.getState().commit(); // inner commit — no entry
    store.getState().apply(addType('C'));
    store.getState().commit(); // outer commit — one entry

    store.getState().undo();
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['Seed']);
  });

  it('an op that errors inside a transaction does not corrupt the batch', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().begin();
    store.getState().apply(addType('A'));
    const err = store.getState().apply(addType('A')); // duplicate
    expect('error' in err).toBe(true);
    store.getState().apply(addType('B'));
    store.getState().commit();

    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['A', 'B']);
    store.getState().undo();
    expect(store.getState().schema.types).toEqual([]);
  });
});
