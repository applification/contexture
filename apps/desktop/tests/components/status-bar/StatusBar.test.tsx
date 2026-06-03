import type { Schema } from '@contexture/core/ir';
import { StatusBar } from '@renderer/components/status-bar/StatusBar';
import { useConvexVersionStore } from '@renderer/store/convex-version';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function seed(schema: Schema) {
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

describe('StatusBar validation repairs', () => {
  beforeEach(() => {
    seed({ version: '1', types: [] });
    useGraphSelectionStore.getState().clear();
    useConvexVersionStore.getState().reset();
  });

  afterEach(cleanup);

  it('offers a deterministic repair for an empty enum', () => {
    seed({ version: '1', types: [{ kind: 'enum', name: 'Role', values: [] }] });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'enum',
      name: 'Role',
      values: [{ value: 'value' }],
    });
  });

  it('labels warning-only validation issues as advisories', () => {
    seed({
      version: '1',
      types: [
        { kind: 'object', name: 'Household', table: true, fields: [] },
        {
          kind: 'object',
          name: 'PantryItem',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
            { name: 'expiresOn', type: { kind: 'date' } },
          ],
        },
      ],
    });
    render(<StatusBar />);

    expect(screen.getByRole('button', { name: '1 advisory' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '1 error' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '1 advisory' }));
    expect(screen.getByText(/Household-scoped field "PantryItem.expiresOn"/i)).toBeVisible();
  });

  it('does not offer duplicate enum value repair without index-addressed ops', () => {
    seed({
      version: '1',
      types: [{ kind: 'enum', name: 'Role', values: [{ value: 'admin' }, { value: 'admin' }] }],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    expect(screen.queryByRole('button', { name: 'Rename value' })).not.toBeInTheDocument();
  });

  it('renames a duplicate Convex table name from validation repair', () => {
    seed({
      version: '1',
      types: [
        { kind: 'object', name: 'Post', table: true, fields: [] },
        { kind: 'object', name: 'DuplicatePost', table: true, tableName: 'post', fields: [] },
      ],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename table' }));

    expect(useUndoStore.getState().schema.types[1]).toMatchObject({
      kind: 'object',
      name: 'DuplicatePost',
      tableName: 'post2',
    });
  });

  it('removes only the duplicate import alias from validation repair', () => {
    seed({
      version: '1',
      imports: [
        { kind: 'stdlib', path: '@contexture/common', alias: 'common' },
        { kind: 'relative', path: './legacy.contexture.json', alias: 'common' },
      ],
      types: [],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove duplicate' }));

    expect(useUndoStore.getState().schema.imports).toEqual([
      { kind: 'stdlib', path: '@contexture/common', alias: 'common' },
    ]);
  });

  it('removes an invalid stdlib import from validation repair', () => {
    seed({
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/not-a-namespace', alias: 'legacy' }],
      types: [],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove import' }));

    expect(useUndoStore.getState().schema.imports).toEqual([]);
  });

  it('removes a duplicate field from a Convex index via validation repair', () => {
    seed({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'author', type: { kind: 'string' } }],
          indexes: [{ name: 'by_author', fields: ['author', 'author'] }],
        },
      ],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove duplicate' }));

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'object',
      name: 'Post',
      indexes: [{ name: 'by_author', fields: ['author'] }],
    });
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({ nodeId: 'Post' });
  });

  it('does not offer duplicate field repair without index-addressed ops', () => {
    seed({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [
            { name: 'slug', type: { kind: 'string' } },
            { name: 'slug', type: { kind: 'string' } },
          ],
        },
      ],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    expect(screen.queryByRole('button', { name: 'Rename field' })).not.toBeInTheDocument();
  });

  it('creates a missing local ref target from an unresolved-ref error', () => {
    seed({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [{ name: 'author', type: { kind: 'ref', typeName: 'Author' } }],
        },
      ],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

    expect(useUndoStore.getState().schema.types).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'object', name: 'Author' })]),
    );
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({ nodeId: 'Author' });
  });

  it('clicking a field-scoped validation error selects the affected field', () => {
    seed({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          fields: [{ name: 'author', type: { kind: 'ref', typeName: 'Author' } }],
        },
      ],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: /unresolved ref "Author"/i }));

    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Post');
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({
      nodeId: 'Post',
      fieldName: 'author',
    });
    expect(useGraphSelectionStore.getState().state.selectedField).toEqual({
      typeName: 'Post',
      fieldName: 'author',
    });
  });

  it('creates a missing discriminated-union variant object with a discriminator field', () => {
    seed({
      version: '1',
      types: [
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['UserSignup'],
        },
      ],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create variant' }));

    expect(useUndoStore.getState().schema.types).toEqual(
      expect.arrayContaining([
        {
          kind: 'object',
          name: 'UserSignup',
          fields: [{ name: 'type', type: { kind: 'literal', value: 'user-signup' } }],
        },
      ]),
    );
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({ nodeId: 'UserSignup' });
  });

  it('removes a discriminated-union variant that points at a non-object type', () => {
    seed({
      version: '1',
      types: [
        { kind: 'enum', name: 'Color', values: [{ value: 'red' }] },
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['Color'],
        },
      ],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove variant' }));

    expect(useUndoStore.getState().schema.types[1]).toMatchObject({
      kind: 'discriminatedUnion',
      name: 'Event',
      variants: [],
    });
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({ nodeId: 'Event' });
  });

  it('adds a missing discriminator field to an existing variant object', () => {
    seed({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'LoginEvent',
          fields: [{ name: 'userId', type: { kind: 'string' } }],
        },
        {
          kind: 'discriminatedUnion',
          name: 'Event',
          discriminator: 'type',
          variants: ['LoginEvent'],
        },
      ],
    });
    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: '1 error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add discriminator' }));

    expect(useUndoStore.getState().schema.types[0]).toMatchObject({
      kind: 'object',
      name: 'LoginEvent',
      fields: [
        { name: 'type', type: { kind: 'literal', value: 'login-event' } },
        { name: 'userId', type: { kind: 'string' } },
      ],
    });
    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({ nodeId: 'LoginEvent' });
  });

  it('shows an actionable Convex version badge when target app version differs', () => {
    useConvexVersionStore.setState({
      emitterVersion: '1.40.0',
      targetVersion: '1.37.0',
      targetPackagePath: '/repo/apps/plantry/package.json',
      status: 'mismatch',
      message: 'Contexture emitter and target app Convex versions differ.',
    });

    render(<StatusBar />);

    expect(screen.getByTestId('status-convex-version')).toHaveTextContent('Convex mismatch');
  });
});
