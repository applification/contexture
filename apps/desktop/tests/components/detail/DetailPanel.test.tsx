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
import { useChatComposerStore } from '@renderer/store/chat-composer';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    useUIChromeStore.getState().setSidebarVisible(true);
    useUIChromeStore.getState().setSidebarTab('chat');
    useChatComposerStore.getState().setPendingChatMessage(null);
  });
  afterEach(cleanup);

  it('renders the empty state when nothing is selected', () => {
    render(<DetailPanel selection={{}} />);
    expect(screen.getByText(/Select a type, field, or edge/i)).toBeInTheDocument();
  });

  it('renders TypeDetail when a type is selected', () => {
    seed(plotSchema);
    render(<DetailPanel selection={{ typeName: 'Plot' }} />);
    expect(screen.getByLabelText('Name')).toHaveValue('Plot');
  });

  it('renders FieldDetail when a type + field are selected', () => {
    seed(plotSchema);
    render(<DetailPanel selection={{ typeName: 'Plot', fieldName: 'name' }} />);
    expect(screen.getByTestId('field-detail')).toBeInTheDocument();
  });

  it('keeps field detail focused on the field after it is renamed', async () => {
    const user = userEvent.setup();
    const onSelectField = vi.fn();
    seed(plotSchema);
    useGraphSelectionStore.getState().selectField({ typeName: 'Plot', fieldName: 'name' });

    render(
      <DetailPanel
        selection={{ typeName: 'Plot', fieldName: 'name' }}
        onSelectField={onSelectField}
      />,
    );

    const input = screen.getByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'title');
    fireEvent.blur(input);

    expect(useGraphSelectionStore.getState().state.selectedField).toEqual({
      typeName: 'Plot',
      fieldName: 'title',
    });
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({
      nodeId: 'Plot',
      fieldName: 'title',
    });
    expect(onSelectField).toHaveBeenCalledWith('Plot', 'title');
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
    fireEvent.click(screen.getByRole('button', { name: 'Model advice' }));
    expect(screen.getAllByText('Query handle').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/denormalized/i).length).toBeGreaterThan(0);
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
    expect(within(issues).getByText('enum_empty')).toBeInTheDocument();
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
    expect(within(issues).getByText('unresolved_ref')).toBeInTheDocument();
    expect(within(issues).getByText(/Unresolved ref "Author"/i)).toBeInTheDocument();
    expect(within(issues).getByText('types.0.fields.0.type')).toBeInTheDocument();
  });

  it('renders field-level validation warnings as advisories', () => {
    seedUnchecked({
      version: '1',
      metadata: { description: 'Mobile and web meal planning app.' },
      types: [
        { kind: 'enum', name: 'ChannelIdentityStatus', values: [{ value: 'active' }] },
        {
          kind: 'object',
          name: 'ChannelIdentity',
          table: true,
          fields: [
            {
              name: 'status',
              type: { kind: 'ref', typeName: 'ChannelIdentityStatus' },
            },
          ],
        },
      ],
    });

    render(<DetailPanel selection={{ typeName: 'ChannelIdentity', fieldName: 'status' }} />);

    const issues = screen.getByRole('region', { name: 'Validation issues' });
    expect(within(issues).getByText('Advisory')).toBeInTheDocument();
    expect(within(issues).getByText('operational_enum_evolution')).toBeInTheDocument();
    expect(issues).toHaveClass('border-warning/35', 'bg-warning/10');
    expect(issues).not.toHaveClass('border-destructive/35', 'bg-destructive/10');
  });

  it('opens field-level validation warnings in chat', () => {
    seedUnchecked({
      version: '1',
      metadata: { description: 'Mobile and web meal planning app.' },
      types: [
        { kind: 'enum', name: 'ChannelIdentityStatus', values: [{ value: 'active' }] },
        {
          kind: 'object',
          name: 'ChannelIdentity',
          table: true,
          fields: [
            {
              name: 'status',
              type: { kind: 'ref', typeName: 'ChannelIdentityStatus' },
            },
          ],
        },
      ],
    });

    render(<DetailPanel selection={{ typeName: 'ChannelIdentity', fieldName: 'status' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discuss in chat' }));

    expect(useUIChromeStore.getState().sidebarTab).toBe('chat');
    expect(useChatComposerStore.getState().pendingChatMessage?.message).toContain(
      'operational_enum_evolution',
    );
    expect(useChatComposerStore.getState().pendingChatMessage?.message).toContain(
      'Severity: warning',
    );
    expect(useChatComposerStore.getState().pendingChatMessage?.message).toContain(
      'types.1.fields.0.type',
    );
  });

  it('documents compatibility contracts from field-level enum evolution advisories', () => {
    seedUnchecked({
      version: '1',
      metadata: { description: 'Mobile and web meal planning app.' },
      types: [
        { kind: 'enum', name: 'ChannelIdentityStatus', values: [{ value: 'active' }] },
        {
          kind: 'object',
          name: 'ChannelIdentity',
          table: true,
          fields: [
            {
              name: 'status',
              type: { kind: 'ref', typeName: 'ChannelIdentityStatus' },
            },
          ],
        },
      ],
    });

    render(<DetailPanel selection={{ typeName: 'ChannelIdentity', fieldName: 'status' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Document contract' }));

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'enum',
      name: 'ChannelIdentityStatus',
      compatibility: {
        enumEvolution: {
          unknownValueBehavior: 'preserve',
          fallbackLabel: 'Unknown channel identity status',
          clientSurfaces: ['web', 'mobile', 'api'],
          owner: 'client',
        },
      },
    });

    cleanup();
    render(<DetailPanel selection={{ typeName: 'ChannelIdentity', fieldName: 'status' }} />);
    expect(screen.queryByRole('region', { name: 'Validation issues' })).not.toBeInTheDocument();
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

  it('renders EdgeDetail when an edge is selected', () => {
    const edge: RefEdgeData = {
      relation: 'fieldRef',
      sourceType: 'Plot',
      sourceField: 'harvest',
      targetType: 'Harvest',
      crossBoundary: false,
    };
    render(<DetailPanel selection={{ edge }} />);
    expect(screen.getByText('Modeled ref edge')).toBeInTheDocument();
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

  it('renders read-only details for selected stdlib raw nodes', () => {
    render(<DetailPanel selection={{ typeName: 'common.URL' }} />);

    expect(screen.getByTestId('external-type-detail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'common.URL' })).toBeInTheDocument();
    expect(screen.getByText('Read-only library type')).toBeInTheDocument();
    expect(screen.getByText(/Absolute URL/i)).toBeInTheDocument();
    expect(screen.getByText(/"format": "uri"/i)).toBeInTheDocument();
    expect(screen.queryByText(/No type named/i)).not.toBeInTheDocument();
  });

  it('links selected stdlib nodes through to the stdlib sidebar', () => {
    render(<DetailPanel selection={{ typeName: 'common.URL' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'View in Stdlib' }));

    expect(useUIChromeStore.getState().sidebarVisible).toBe(true);
    expect(useUIChromeStore.getState().sidebarTab).toBe('stdlib');
  });

  it('renders read-only details for selected stdlib enum nodes', () => {
    render(<DetailPanel selection={{ typeName: 'place.CountryCode' }} />);

    expect(screen.getByTestId('external-type-detail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'place.CountryCode' })).toBeInTheDocument();
    expect(screen.getByText(/ISO 3166-1/i)).toBeInTheDocument();
    expect(screen.getByText('GB')).toBeInTheDocument();
    expect(screen.queryByText(/No type named/i)).not.toBeInTheDocument();
  });
});
