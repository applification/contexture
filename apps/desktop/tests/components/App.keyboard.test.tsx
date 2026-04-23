/**
 * Global keyboard shortcuts — driven from the document listener in
 * `App.tsx`. Asserts the outcome via the selection store / undo store
 * rather than reaching into the implementation.
 */
import App from '@renderer/App';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  // Reset every backing store to a clean slate so each test stands alone.
  useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  // Clear past/future by popping until empty.
  while (useUndoStore.getState().canUndo) useUndoStore.getState().undo();
  useGraphSelectionStore.getState().clear();
  (window as unknown as { contexture: unknown }).contexture = {
    chat: {
      send: vi.fn(async () => ({ ok: false })),
      setIR: vi.fn(),
      detectClaudeCli: vi.fn(async () => ({ installed: false, path: null })),
      setAuth: vi.fn(async () => ({ ok: true })),
      setModelOptions: vi.fn(async () => ({ ok: true })),
      abort: vi.fn(async () => ({ ok: true })),
      replyOp: vi.fn(),
      onAssistant: () => () => undefined,
      onToolUse: () => () => undefined,
      onResult: () => () => undefined,
      onError: () => () => undefined,
      onTurnBegin: () => () => undefined,
      onTurnCommit: () => () => undefined,
      onTurnRollback: () => () => undefined,
      onOpRequest: () => () => undefined,
    },
  };
});

afterEach(() => {
  cleanup();
});

describe('App global keyboard', () => {
  it('Escape clears selection', () => {
    useGraphSelectionStore.getState().click('Plot', 'replace');
    render(<App />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBeNull();
  });

  it('Cmd+Z undoes the last op', () => {
    render(<App />);
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    expect(useUndoStore.getState().schema.types).toHaveLength(1);
    fireEvent.keyDown(document, { key: 'z', metaKey: true });
    expect(useUndoStore.getState().schema.types).toHaveLength(0);
  });

  it('Delete removes the selected type', () => {
    render(<App />);
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    useGraphSelectionStore.getState().click('Plot', 'replace');
    fireEvent.keyDown(document, { key: 'Delete' });
    expect(useUndoStore.getState().schema.types).toEqual([]);
    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBeNull();
  });

  it('ignores typing shortcuts inside inputs', () => {
    render(<App />);
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    useGraphSelectionStore.getState().click('Plot', 'replace');
    // Fire Delete on an <input> inside the DOM — it shouldn't delete
    // the selected type.
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Delete' });
    document.body.removeChild(input);
    expect(useUndoStore.getState().schema.types).toHaveLength(1);
  });
});
