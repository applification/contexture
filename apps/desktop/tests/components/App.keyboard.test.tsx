/**
 * Global keyboard shortcuts — driven from the document listener in
 * `App.tsx`. Asserts the outcome via the selection store / undo store
 * rather than reaching into the implementation.
 */
import App from '@renderer/App';
import { TYPE_EDGE_SELECT_EVENT } from '@renderer/components/graph/edge-select-event';
import {
  TYPE_NODE_ADD_FIELD_EVENT,
  TYPE_NODE_EVENT,
} from '@renderer/components/graph/nodes/TypeNode';
import type { RefEdgeData } from '@renderer/components/graph/schema-to-graph';
import { useGraphLayoutStore } from '@renderer/store/layout-config';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unsub = () => undefined;

beforeEach(() => {
  // Reset every backing store to a clean slate so each test stands alone.
  useUndoStore.setState({
    schema: { version: '1', types: [] },
    past: [],
    future: [],
    txDepth: 0,
    txStart: null,
    canUndo: false,
    canRedo: false,
  });
  useGraphSelectionStore.getState().clear();
  useGraphLayoutStore.getState().resetToDefaults();
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

  it('F2 opens properties and focuses the selected type name', async () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    useGraphSelectionStore.getState().click('Plot', 'replace');
    render(<App />);

    fireEvent.keyDown(document, { key: 'F2' });

    const input = await screen.findByLabelText('Name');
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe('Plot'.length);
  });

  it('opens field details from a graph field-select event', async () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: {
        kind: 'object',
        name: 'Plot',
        fields: [{ name: 'name', type: { kind: 'string' } }],
      },
    });
    render(<App />);

    document.dispatchEvent(
      new CustomEvent(TYPE_NODE_EVENT, { detail: { typeName: 'Plot', fieldName: 'name' } }),
    );

    expect(await screen.findByTestId('field-detail')).toHaveTextContent('name');
  });

  it('Delete removes a selected field before deleting the selected type', async () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: {
        kind: 'object',
        name: 'Plot',
        fields: [
          { name: 'name', type: { kind: 'string' } },
          { name: 'area', type: { kind: 'number' } },
        ],
      },
    });
    render(<App />);

    document.dispatchEvent(
      new CustomEvent(TYPE_NODE_EVENT, { detail: { typeName: 'Plot', fieldName: 'name' } }),
    );
    expect(await screen.findByTestId('field-detail')).toHaveTextContent('name');
    fireEvent.keyDown(document, { key: 'Delete' });

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'object',
      name: 'Plot',
      fields: [{ name: 'area', type: { kind: 'number' } }],
    });
    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Plot');
  });

  it('adds a field from the graph node add-field event', () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    render(<App />);

    screen.getByTestId('graph-canvas').dispatchEvent(
      new CustomEvent(TYPE_NODE_ADD_FIELD_EVENT, {
        bubbles: true,
        detail: { typeName: 'Plot' },
      }),
    );

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'object',
      name: 'Plot',
      fields: [{ name: 'field1', type: { kind: 'string' } }],
    });
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({
      nodeId: 'Plot',
      fieldName: 'field1',
    });
  });

  it('Cmd+Shift+F adds and opens a field on the selected object', async () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    useGraphSelectionStore.getState().click('Plot', 'replace');
    render(<App />);

    fireEvent.keyDown(document, { key: 'F', metaKey: true, shiftKey: true });

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'object',
      name: 'Plot',
      fields: [{ name: 'field1', type: { kind: 'string' } }],
    });
    expect(await screen.findByTestId('field-detail')).toHaveTextContent('field1');
  });

  it('Cmd+Shift+F does nothing when the selected type cannot have fields', () => {
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'enum', name: 'Season', values: [{ value: 'spring' }] },
    });
    useGraphSelectionStore.getState().click('Season', 'replace');
    render(<App />);

    fireEvent.keyDown(document, { key: 'F', metaKey: true, shiftKey: true });

    expect(useUndoStore.getState().schema.types[0]).toEqual({
      kind: 'enum',
      name: 'Season',
      values: [{ value: 'spring' }],
    });
  });

  it('opens edge details and jumps back to the source field', async () => {
    useUndoStore.getState().apply({
      kind: 'replace_schema',
      schema: {
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Plot',
            fields: [{ name: 'harvest', type: { kind: 'ref', typeName: 'Harvest' } }],
          },
          { kind: 'object', name: 'Harvest', fields: [] },
        ],
      },
    });
    const edge: RefEdgeData = {
      relation: 'fieldRef',
      sourceType: 'Plot',
      sourceField: 'harvest',
      targetType: 'Harvest',
      crossBoundary: false,
    };
    useGraphSelectionStore.getState().click('Plot', 'replace');
    useGraphSelectionStore.getState().selectEdge({ edgeId: 'Plot:harvest->Harvest', data: edge });
    render(<App />);

    document.dispatchEvent(
      new CustomEvent(TYPE_EDGE_SELECT_EVENT, {
        detail: { edgeId: 'Plot:harvest->Harvest', data: edge },
      }),
    );

    expect(await screen.findByText('Ref edge')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit field' }));

    expect(await screen.findByTestId('field-detail')).toHaveTextContent('harvest');
    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Plot');
    expect(useGraphSelectionStore.getState().state.edgeId).toBeNull();
  });

  it('clears edge details when the backing edge no longer exists', async () => {
    useUndoStore.getState().apply({
      kind: 'replace_schema',
      schema: {
        version: '1',
        types: [
          {
            kind: 'object',
            name: 'Plot',
            fields: [{ name: 'harvest', type: { kind: 'ref', typeName: 'Harvest' } }],
          },
          { kind: 'object', name: 'Harvest', fields: [] },
        ],
      },
    });
    const edge: RefEdgeData = {
      relation: 'fieldRef',
      sourceType: 'Plot',
      sourceField: 'harvest',
      targetType: 'Harvest',
      crossBoundary: false,
    };
    useGraphSelectionStore.getState().click('Plot', 'replace');
    useGraphSelectionStore.getState().selectEdge({ edgeId: 'Plot.harvest->Harvest', data: edge });
    render(<App />);

    document.dispatchEvent(
      new CustomEvent(TYPE_EDGE_SELECT_EVENT, {
        detail: { edgeId: 'Plot.harvest->Harvest', data: edge },
      }),
    );

    expect(await screen.findByText('Ref edge')).toBeInTheDocument();
    useUndoStore.getState().apply({
      kind: 'remove_field',
      typeName: 'Plot',
      fieldName: 'harvest',
    });

    await waitFor(() => {
      expect(screen.queryByText('Ref edge')).not.toBeInTheDocument();
      expect(useGraphSelectionStore.getState().state.edgeId).toBeNull();
    });
  });

  it('ignores typing shortcuts inside inputs', () => {
    render(<App />);
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    useGraphSelectionStore.getState().click('Plot', 'replace');
    const before = useUndoStore.getState().schema.types.map((type) => type.name);
    // Fire Delete on an <input> inside the DOM — it shouldn't delete
    // the selected type.
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Delete' });
    fireEvent.keyDown(input, { key: 'T', metaKey: true, shiftKey: true });
    fireEvent.keyDown(input, { key: 'F', metaKey: true, shiftKey: true });
    document.body.removeChild(input);
    expect(useUndoStore.getState().schema.types.map((type) => type.name)).toEqual(before);
  });

  it('Cmd+Shift+T creates and selects a table', () => {
    render(<App />);

    fireEvent.keyDown(document, { key: 'T', metaKey: true, shiftKey: true });

    const selected = selectedType();
    expect(selected).toMatchObject({ kind: 'object', fields: [], table: true });
    expect(selected?.name).toMatch(/^Table\d+$/u);
  });

  it('Cmd+Shift+O creates and selects an object', () => {
    render(<App />);

    fireEvent.keyDown(document, { key: 'O', metaKey: true, shiftKey: true });

    const selected = selectedType();
    expect(selected).toMatchObject({ kind: 'object', fields: [] });
    expect(selected?.name).toMatch(/^Object\d+$/u);
  });

  it('Cmd+Shift+E creates and selects an enum and reveals enum nodes', () => {
    render(<App />);

    expect(useGraphLayoutStore.getState().graphLayout.showEnums).toBe(false);
    fireEvent.keyDown(document, { key: 'E', metaKey: true, shiftKey: true });

    expect(useGraphLayoutStore.getState().graphLayout.showEnums).toBe(true);
    const selected = selectedType();
    expect(selected).toMatchObject({ kind: 'enum', values: [{ value: 'value' }] });
    expect(selected?.name).toMatch(/^Enum\d+$/u);
  });

  it('Cmd+Shift+U creates and selects a discriminated union', () => {
    render(<App />);

    fireEvent.keyDown(document, { key: 'U', metaKey: true, shiftKey: true });

    const selected = selectedType();
    expect(selected).toMatchObject({
      kind: 'discriminatedUnion',
      discriminator: 'kind',
      variants: [],
    });
    expect(selected?.name).toMatch(/^Union\d+$/u);
  });

  it('creates and selects a table from the toolbar', () => {
    render(<App />);

    fireEvent.click(screen.getByTitle('Create type'));
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    const selected = selectedType();
    expect(selected).toMatchObject({ kind: 'object', fields: [], table: true });
    expect(selected?.name).toMatch(/^Table\d+$/u);
  });

  it('shows enum nodes after creating an enum from the toolbar', () => {
    render(<App />);

    expect(useGraphLayoutStore.getState().graphLayout.showEnums).toBe(false);
    fireEvent.click(screen.getByTitle('Create type'));
    fireEvent.click(screen.getByRole('button', { name: 'Enum' }));

    expect(useGraphLayoutStore.getState().graphLayout.showEnums).toBe(true);
    const selected = selectedType();
    expect(selected).toMatchObject({ kind: 'enum', values: [{ value: 'value' }] });
    expect(selected?.name).toMatch(/^Enum\d+$/u);
  });

  it('creates and selects a discriminated union from the toolbar', () => {
    render(<App />);

    fireEvent.click(screen.getByTitle('Create type'));
    fireEvent.click(screen.getByRole('button', { name: 'Union' }));

    const selected = selectedType();
    expect(selected).toMatchObject({
      kind: 'discriminatedUnion',
      discriminator: 'kind',
      variants: [],
    });
    expect(selected?.name).toMatch(/^Union\d+$/u);
  });
});

function selectedType() {
  const selected = useGraphSelectionStore.getState().state.primaryNodeId;
  expect(selected).toBeTruthy();
  return useUndoStore.getState().schema.types.find((type) => type.name === selected);
}
