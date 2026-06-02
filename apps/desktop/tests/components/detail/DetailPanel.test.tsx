/**
 * DetailPanel — selection routing. Asserts each branch of the
 * `typeName` / `fieldName` / `edge` selection logic picks the right
 * sub-panel and the empty states surface with a helpful message.
 *
 * We exercise the panel against the real `useUndoStore` singleton so the
 * schema lookup path is covered; the test seeds the store via
 * `replace_schema` between renders.
 */

import type { Schema } from '@contexture/core/ir';
import { DetailPanel } from '@renderer/components/detail/DetailPanel';
import type { RefEdgeData } from '@renderer/components/graph/schema-to-graph';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function seed(schema: Schema) {
  useUndoStore.getState().apply({ kind: 'replace_schema', schema });
}

function seedUnchecked(schema: Schema) {
  useUndoStore.setState({
    schema,
    past: [],
    future: [],
    txDepth: 0,
    txStart: null,
    canUndo: false,
    canRedo: false,
  });
}

const plotSchema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Plot',
      fields: [{ name: 'name', type: { kind: 'string' } }],
    },
  ],
};

const artworkSchema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Artwork',
      table: true,
      fields: [
        {
          name: 'sourceSearchText',
          description: 'Denormalized lowercase search text.',
          type: { kind: 'string' },
        },
        {
          name: 'media',
          type: { kind: 'array', element: { kind: 'ref', typeName: 'ArtworkMedia' } },
        },
      ],
    },
    {
      kind: 'object',
      name: 'ArtworkMedia',
      fields: [
        { name: 'storageId', type: { kind: 'string' } },
        { name: 'alt', type: { kind: 'string' } },
      ],
    },
  ],
};

describe('DetailPanel', () => {
  beforeEach(() => {
    seed({ version: '1', types: [] });
    useGraphSelectionStore.getState().clear();
  });
  afterEach(cleanup);

  it('renders the empty state when nothing is selected', () => {
    render(<DetailPanel selection={{}} />);
    expect(screen.getByText(/Select a type, field, or edge/i)).toBeInTheDocument();
  });

  it('renders TypeDetail when a type is selected', () => {
    seed(plotSchema);
    render(<DetailPanel selection={{ typeName: 'Plot' }} />);
    const header = screen.getByTestId('type-detail-header');
    expect(header).toContainElement(screen.getByRole('heading', { name: 'Plot' }));
    expect(header).toHaveTextContent('object');
  });

  it('shows the scoped sample-record workbench when a table type is selected', () => {
    seed(artworkSchema);
    render(<DetailPanel selection={{ typeName: 'Artwork' }} />);

    const workbench = screen.getByRole('region', { name: 'Artwork sample records' });
    expect(within(workbench).getByRole('button', { name: 'New record' })).toBeInTheDocument();
    expect(
      within(workbench).getByRole('button', { name: 'Seed current entity' }),
    ).toBeInTheDocument();
    expect(within(workbench).getByText('No sample records yet')).toBeInTheDocument();
  });

  it('renders FieldDetail when a type + field are selected', () => {
    seed(plotSchema);
    render(<DetailPanel selection={{ typeName: 'Plot', fieldName: 'name' }} />);
    expect(screen.getByTestId('field-detail')).toBeInTheDocument();
  });

  it('derives model shape guidance for the selected type from the schema', () => {
    seed(artworkSchema);
    render(<DetailPanel selection={{ typeName: 'ArtworkMedia' }} />);
    expect(screen.getByText('Model shape')).toBeInTheDocument();
    expect(screen.getByText('Possible entity')).toBeInTheDocument();
    expect(screen.getByText(/Keep it embedded/i)).toBeInTheDocument();
  });

  it('derives field-level query handle guidance for the selected field', () => {
    seed(artworkSchema);
    render(<DetailPanel selection={{ typeName: 'Artwork', fieldName: 'sourceSearchText' }} />);
    expect(screen.getByTestId('field-detail')).toBeInTheDocument();
    const guidance = screen.getByRole('region', { name: 'Model shape' });
    expect(within(guidance).getByText('Query handle')).toBeInTheDocument();
    expect(within(guidance).getByText(/denormalized/i)).toBeInTheDocument();
  });

  it('creates a referenced object type from the field target picker', () => {
    seed(artworkSchema);
    render(<DetailPanel selection={{ typeName: 'Artwork', fieldName: 'media' }} />);

    fireEvent.click(screen.getByLabelText('target'));
    fireEvent.click(screen.getByRole('button', { name: 'Create object target' }));

    const schema = useUndoStore.getState().schema;
    expect(schema.types).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'object', name: 'Media' })]),
    );
    const artwork = schema.types.find((type) => type.name === 'Artwork');
    expect(artwork).toMatchObject({
      kind: 'object',
      fields: expect.arrayContaining([
        { name: 'media', type: { kind: 'array', element: { kind: 'ref', typeName: 'Media' } } },
      ]),
    });

    useUndoStore.getState().undo();
    expect(useUndoStore.getState().schema).toEqual(artworkSchema);
  });

  it('creates a discriminated-union object variant as one undoable edit', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: [],
        },
      ],
    };
    seed(schema);
    render(<DetailPanel selection={{ typeName: 'Event' }} />);

    fireEvent.change(screen.getByLabelText('New variant'), { target: { value: 'Signup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create object' }));

    expect(useUndoStore.getState().schema.types).toEqual(
      expect.arrayContaining([
        {
          kind: 'object',
          name: 'Signup',
          fields: [{ name: 'type', type: { kind: 'literal', value: 'signup' } }],
        },
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['Signup'],
        },
      ]),
    );

    useUndoStore.getState().undo();
    expect(useUndoStore.getState().schema).toEqual(schema);
  });

  it('shows validation issues scoped to the selected type', () => {
    seedUnchecked({
      version: '1',
      types: [{ kind: 'enum', name: 'Role', values: [] }],
    });

    render(<DetailPanel selection={{ typeName: 'Role' }} />);

    const issues = screen.getByRole('region', { name: 'Validation issues' });
    expect(within(issues).getByText(/must have at least one value/i)).toBeInTheDocument();
    expect(within(issues).getByText('types.0.values')).toBeInTheDocument();
  });

  it('offers deterministic validation repair from the selected type details', () => {
    seedUnchecked({
      version: '1',
      types: [{ kind: 'enum', name: 'Role', values: [] }],
    });

    render(<DetailPanel selection={{ typeName: 'Role' }} />);
    const issues = screen.getByRole('region', { name: 'Validation issues' });
    fireEvent.click(within(issues).getByRole('button', { name: 'Add value' }));

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'enum',
      name: 'Role',
      values: [{ value: 'value' }],
    });
  });

  it('does not offer duplicate enum value repair without index-addressed ops', () => {
    seedUnchecked({
      version: '1',
      types: [{ kind: 'enum', name: 'Role', values: [{ value: 'admin' }, { value: 'admin' }] }],
    });

    render(<DetailPanel selection={{ typeName: 'Role' }} />);
    expect(screen.queryByRole('button', { name: 'Rename value' })).not.toBeInTheDocument();
  });

  it('shows validation issues scoped to the selected field', () => {
    seedUnchecked({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [
            { name: 'author', type: { kind: 'ref', typeName: 'Author' } },
            { name: 'title', type: { kind: 'string' } },
          ],
        },
      ],
    });

    render(<DetailPanel selection={{ typeName: 'Post', fieldName: 'author' }} />);

    const issues = screen.getByRole('region', { name: 'Validation issues' });
    expect(within(issues).getByText(/Unresolved ref "Author"/i)).toBeInTheDocument();
    expect(within(issues).getByText('types.0.fields.0.type')).toBeInTheDocument();
  });

  it('offers deterministic validation repair from the selected field details', () => {
    seedUnchecked({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [{ name: 'author', type: { kind: 'ref', typeName: 'Author' } }],
        },
      ],
    });

    render(<DetailPanel selection={{ typeName: 'Post', fieldName: 'author' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

    expect(useUndoStore.getState().schema.types).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'object', name: 'Author' })]),
    );
  });

  it('clears graph and app selection after deleting the selected type from details', () => {
    seed(plotSchema);
    useGraphSelectionStore.getState().click('Plot', 'replace');
    const onClearSelection = vi.fn();

    render(<DetailPanel selection={{ typeName: 'Plot' }} onClearSelection={onClearSelection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete type Plot' }));

    expect(useUndoStore.getState().schema.types).toEqual([]);
    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBeNull();
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it('returns to the type selection after deleting the selected field from details', () => {
    seed(plotSchema);
    useGraphSelectionStore.getState().click('Plot', 'replace');
    const onClearSelectedField = vi.fn();

    render(
      <DetailPanel
        selection={{ typeName: 'Plot', fieldName: 'name' }}
        onClearSelectedField={onClearSelectedField}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete field name' }));

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'object',
      name: 'Plot',
      fields: [],
    });
    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Plot');
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({ nodeId: 'Plot' });
    expect(onClearSelectedField).toHaveBeenCalledOnce();
  });

  it('renders EdgeDetail when an edge is selected', () => {
    const edge: RefEdgeData = {
      relation: 'fieldRef',
      sourceType: 'Plot',
      sourceField: 'harvest',
      targetType: 'Harvest',
      crossBoundary: false,
    };
    render(<DetailPanel selection={{ edge }} />);
    expect(screen.getByText('Ref edge')).toBeInTheDocument();
  });

  it('selects the source field from an editable edge detail', () => {
    const edge: RefEdgeData = {
      relation: 'fieldRef',
      sourceType: 'Plot',
      sourceField: 'harvest',
      targetType: 'Harvest',
      crossBoundary: false,
    };
    const onSelectField = vi.fn();

    render(<DetailPanel selection={{ edge }} onSelectField={onSelectField} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit field' }));

    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Plot');
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({
      nodeId: 'Plot',
      fieldName: 'harvest',
    });
    expect(onSelectField).toHaveBeenCalledWith('Plot', 'harvest');
  });

  it('shows an empty state when the selected type no longer exists', () => {
    render(<DetailPanel selection={{ typeName: 'Missing' }} />);
    expect(screen.getByText(/No type named "Missing"/i)).toBeInTheDocument();
  });
});
