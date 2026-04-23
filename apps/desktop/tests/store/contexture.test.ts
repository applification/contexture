import type { Schema } from '@renderer/model/types';
import { createContextureStore } from '@renderer/store/contexture';
import { describe, expect, it } from 'vitest';

const empty: Schema = { version: '1', types: [] };

describe('contexture store', () => {
  it('holds an initial schema and dispatches ops through the reducer', () => {
    const store = createContextureStore(empty);
    expect(store.getState().schema).toEqual(empty);

    const res = store.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'User', fields: [] },
    });
    expect('error' in res).toBe(false);
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User']);
  });

  it('leaves the schema untouched when an op errors', () => {
    const store = createContextureStore(empty);
    const res = store.getState().apply({ kind: 'delete_type', name: 'Ghost' });
    expect('error' in res).toBe(true);
    expect(store.getState().schema).toEqual(empty);
  });
});
