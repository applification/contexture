import type { Schema } from '@contexture/core/ir';
import { GraphSearchBar } from '@renderer/components/toolbar/GraphSearchBar';
import { useGraphLayoutStore } from '@renderer/store/layout-config';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const schema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Recipe',
      fields: [{ name: 'season', type: { kind: 'ref', typeName: 'Season' } }],
    },
    {
      kind: 'object',
      name: 'Artwork',
      table: true,
      fields: [],
    },
    {
      kind: 'discriminatedUnion',
      name: 'ArtworkSourceReference',
      discriminator: 'kind',
      variants: [],
    },
    {
      kind: 'enum',
      name: 'Season',
      values: [{ value: 'spring' }, { value: 'summer' }],
    },
  ],
};

describe('GraphSearchBar', () => {
  beforeEach(() => {
    useUndoStore.setState({
      schema,
      past: [],
      future: [],
      txDepth: 0,
      txStart: null,
      canUndo: false,
      canRedo: false,
    });
    useGraphLayoutStore.getState().resetToDefaults();
    useGraphSelectionStore.getState().clear();
  });

  afterEach(cleanup);

  it('surfaces hidden local enums as inline field usages and focuses the owning type', () => {
    render(<GraphSearchBar />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search types and enums' }), {
      target: { value: 'Season' },
    });

    expect(screen.queryByText('(Recipe.season)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Season.*enum/ }));

    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({
      nodeId: 'Recipe',
      fieldName: 'season',
    });
  });

  it('focuses enum nodes directly when expanded enum nodes are visible', () => {
    useGraphLayoutStore.getState().setGraphLayout({ showEnums: true });
    render(<GraphSearchBar />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search types and enums' }), {
      target: { value: 'Season' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Season.*enum/ }));

    expect(useGraphSelectionStore.getState().state.focusTarget).toEqual({ nodeId: 'Season' });
  });

  it('shows kind badges for mixed type results', () => {
    useGraphLayoutStore.getState().setGraphLayout({ showEnums: true });
    render(<GraphSearchBar />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search types and enums' }), {
      target: { value: 'Artwork' },
    });

    expect(screen.getByRole('button', { name: /Artwork.*table/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ArtworkSourceReference.*union/ }),
    ).toBeInTheDocument();
  });
});
