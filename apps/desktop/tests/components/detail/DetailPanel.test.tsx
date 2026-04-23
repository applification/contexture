/**
 * DetailPanel — selection routing. Asserts each branch of the
 * `typeName` / `fieldName` / `edge` selection logic picks the right
 * sub-panel and the empty states surface with a helpful message.
 *
 * We exercise the panel against the real `useUndoStore` singleton so the
 * schema lookup path is covered; the test seeds the store via
 * `replace_schema` between renders.
 */
import { DetailPanel } from '@renderer/components/detail/DetailPanel';
import type { RefEdgeData } from '@renderer/components/graph/schema-to-graph';
import type { Schema } from '@renderer/model/ir';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function seed(schema: Schema) {
  useUndoStore.getState().apply({ kind: 'replace_schema', schema });
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

describe('DetailPanel', () => {
  beforeEach(() => seed({ version: '1', types: [] }));
  afterEach(cleanup);

  it('renders the empty state when nothing is selected', () => {
    render(<DetailPanel selection={{}} />);
    expect(screen.getByText(/Select a type, field, or edge/i)).toBeInTheDocument();
  });

  it('renders TypeDetail when a type is selected', () => {
    seed(plotSchema);
    render(<DetailPanel selection={{ typeName: 'Plot' }} />);
    expect(screen.getByText('Plot')).toBeInTheDocument();
    expect(screen.getByText('object')).toBeInTheDocument();
  });

  it('renders FieldDetail when a type + field are selected', () => {
    seed(plotSchema);
    render(<DetailPanel selection={{ typeName: 'Plot', fieldName: 'name' }} />);
    expect(screen.getByTestId('field-detail')).toBeInTheDocument();
  });

  it('renders EdgeDetail when an edge is selected', () => {
    const edge: RefEdgeData = {
      sourceType: 'Plot',
      sourceField: 'harvest',
      targetType: 'Harvest',
      crossBoundary: false,
    };
    render(<DetailPanel selection={{ edge }} />);
    expect(screen.getByText('Ref edge')).toBeInTheDocument();
  });

  it('shows an empty state when the selected type no longer exists', () => {
    render(<DetailPanel selection={{ typeName: 'Missing' }} />);
    expect(screen.getByText(/No type named "Missing"/i)).toBeInTheDocument();
  });
});
