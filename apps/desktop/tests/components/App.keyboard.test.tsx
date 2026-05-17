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

const unsub = () => undefined;

beforeEach(() => {
  // Reset every backing store to a clean slate so each test stands alone.
  useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  // Clear past/future by popping until empty.
  while (useUndoStore.getState().canUndo) useUndoStore.getState().undo();
  useGraphSelectionStore.getState().clear();
  (window as unknown as { contexture: unknown }).contexture = {
    schemaAgent: {
      send: vi.fn(async () => ({ ok: true })),
      setIR: vi.fn(),
      abort: vi.fn(async () => ({ ok: true })),
      getStatus: vi.fn(async () => ({ provider: 'codex', readiness: 'authenticated_chatgpt' })),
      listModels: vi.fn(async () => [{ id: 'gpt-5.4', label: 'GPT-5.4' }]),
      setProvider: vi.fn(async () => ({ ok: true })),
      setModelOptions: vi.fn(async () => ({ ok: true })),
      startLogin: vi.fn(async () => ({ id: 'login-1', mode: 'chatgpt' })),
      cancelLogin: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      threadSet: vi.fn(async () => ({ ok: true })),
      threadClear: vi.fn(async () => ({ ok: true })),
      replyTool: vi.fn(),
      onAssistantDelta: () => unsub,
      onAssistantFinal: () => unsub,
      onToolCallStarted: () => unsub,
      onToolCallFinished: () => unsub,
      onError: () => unsub,
      onStatusChanged: () => unsub,
      onThreadUpdated: () => unsub,
      onThreadDesynced: () => unsub,
      onToolRequest: () => unsub,
      onTurnBegin: () => unsub,
      onTurnCommit: () => unsub,
      onTurnRollback: () => unsub,
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
