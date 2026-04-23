import { useUndoHotkeys } from '@renderer/hooks/useUndoHotkeys';
import type { Schema } from '@renderer/model/ir';
import { createUndoableContextureStore } from '@renderer/store/undo';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const empty: Schema = { version: '1', types: [] };
const addType = (name: string) =>
  ({ kind: 'add_type', type: { kind: 'object', name, fields: [] } }) as const;

function fireKey(init: KeyboardEventInit) {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(ev);
  return ev;
}

describe('useUndoHotkeys', () => {
  it('cmd/ctrl+z triggers undo; cmd/ctrl+shift+z triggers redo', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().apply(addType('User'));
    store.getState().apply(addType('Post'));

    renderHook(() => useUndoHotkeys(store));

    fireKey({ key: 'z', metaKey: true });
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User']);

    fireKey({ key: 'z', metaKey: true, shiftKey: true });
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User', 'Post']);
  });

  it('ignores z without modifier', () => {
    const store = createUndoableContextureStore(empty);
    store.getState().apply(addType('User'));

    renderHook(() => useUndoHotkeys(store));

    fireKey({ key: 'z' });
    expect(store.getState().schema.types.map((t) => t.name)).toEqual(['User']);
  });
});
