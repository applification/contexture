/**
 * TypeNode component tests — rendering + selection event.
 *
 * XYFlow's `NodeProps` threads through a lot of context (id, selected,
 * draggable, etc.). The component itself doesn't use the full XYFlow
 * runtime — it only reads `data` and `selected` — so we build minimal
 * mock props that satisfy the type checker and exercise the render
 * paths that matter: field rows, optional markers, imported styling,
 * and the bubbling `contexture:field-select` CustomEvent.
 */
import {
  TYPE_NODE_EVENT,
  TYPE_NODE_REF_PREVIEW_EVENT,
  TypeNode,
} from '@renderer/components/graph/nodes/TypeNode';
import type { TypeNodeData } from '@renderer/components/graph/schema-to-graph';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function Wrapper({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

function makeProps(data: TypeNodeData, selected = false) {
  // XYFlow's NodeProps typings are strict; for unit tests we cast away
  // the parts the component doesn't read.
  return {
    id: data.typeName,
    data,
    selected,
    type: 'type' as const,
    dragging: false,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    width: 200,
    height: 60,
    zIndex: 0,
    deletable: true,
    draggable: true,
    selectable: true,
  } as unknown as Parameters<typeof TypeNode>[0];
}

describe('TypeNode', () => {
  beforeEach(() => {
    useGraphSelectionStore.getState().clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders type name, kind, and each field row', () => {
    const data: TypeNodeData = {
      typeName: 'Plot',
      kind: 'object',
      imported: false,
      fields: [
        { name: 'name', summary: 'string', optional: false, nullable: false },
        { name: 'area', summary: 'number', optional: true, nullable: false },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    expect(screen.getByText('Plot')).toBeInTheDocument();
    expect(screen.getByText('object')).toBeInTheDocument();
    // Fields — optional one gets the trailing `?`.
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('area?')).toBeInTheDocument();
    expect(screen.getAllByText('string')).toHaveLength(1);
    expect(screen.getAllByText('number')).toHaveLength(1);
  });

  it('marks imported nodes with dashed border + data flag', () => {
    const data: TypeNodeData = {
      typeName: 'common.Email',
      kind: 'object',
      imported: true,
      fields: [],
    };
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    const node = container.querySelector('[data-testid="type-node"]') as HTMLElement;
    expect(node.dataset.imported).toBe('true');
    expect(node.style.borderStyle).toBe('dashed');
  });

  it('raises a contexture:field-select event with typeName + fieldName when a field is clicked', () => {
    const data: TypeNodeData = {
      typeName: 'Plot',
      kind: 'object',
      imported: false,
      fields: [{ name: 'name', summary: 'string', optional: false, nullable: false }],
    };
    const handler = vi.fn();
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    // Listen on the container because custom events bubble out of the node.
    container.addEventListener(TYPE_NODE_EVENT, handler as EventListener);

    fireEvent.click(screen.getByText('name'));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<{ typeName: string; fieldName: string }>;
    expect(event.detail).toEqual({ typeName: 'Plot', fieldName: 'name' });
  });

  it('selects referenced object targets when a ref field is clicked', () => {
    const data: TypeNodeData = {
      typeName: 'Artwork',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'dimensions',
          summary: '→ ArtworkDimensions',
          optional: false,
          nullable: false,
          refTarget: 'ArtworkDimensions',
        },
      ],
    };
    const handler = vi.fn();
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    container.addEventListener(TYPE_NODE_EVENT, handler as EventListener);

    fireEvent.click(screen.getByTestId('type-node-field'));

    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('ArtworkDimensions');
    expect(handler).not.toHaveBeenCalled();
  });

  it('marks table-flagged nodes with data-table="true"', () => {
    const data: TypeNodeData = {
      typeName: 'Post',
      kind: 'object',
      imported: false,
      table: true,
      fields: [],
    };
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    const node = container.querySelector('[data-testid="type-node"]') as HTMLElement;
    expect(node.dataset.table).toBe('true');
    expect(screen.getByTestId('type-node-header')).toHaveStyle({
      background: 'var(--graph-node-table-header-bg)',
    });
    expect(screen.getByTestId('type-node-table-rail')).toHaveStyle({
      width: '4px',
      background: 'var(--graph-node-table-accent)',
    });
    expect(screen.getByTestId('type-node-table-icon')).toBeInTheDocument();
    expect(screen.getByTestId('type-node-table-label')).toHaveTextContent('table');
    expect(screen.getByTestId('type-node-table-label')).toHaveStyle({
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    });
  });

  it('does not mark non-table nodes with data-table', () => {
    const data: TypeNodeData = {
      typeName: 'Post',
      kind: 'object',
      imported: false,
      fields: [],
    };
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    const node = container.querySelector('[data-testid="type-node"]') as HTMLElement;
    expect(node.dataset.table).toBeUndefined();
  });

  it('does not render a field list when there are no fields', () => {
    const data: TypeNodeData = {
      typeName: 'Empty',
      kind: 'object',
      imported: false,
      fields: [],
    };
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    expect(container.querySelectorAll('[data-testid="type-node-field"]')).toHaveLength(0);
  });

  it('highlights a ref summary when its target node is selected', () => {
    const data: TypeNodeData = {
      typeName: 'Artwork',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'medium',
          summary: '→ ArtworkMedium',
          optional: false,
          nullable: false,
          refTarget: 'ArtworkMedium',
        },
      ],
    };
    useGraphSelectionStore.getState().click('ArtworkMedium', 'replace');

    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    expect(screen.getByTestId('type-node-field-ref-summary')).toHaveStyle({
      color: 'var(--graph-node-selected)',
      fontWeight: '700',
    });
  });

  it('renders local enum refs as inline enum affordances with hover details', () => {
    vi.useFakeTimers();
    const data: TypeNodeData = {
      typeName: 'Recipe',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'season',
          summary: '→ Season',
          optional: false,
          nullable: false,
          refTarget: 'Season',
          enumTarget: {
            name: 'Season',
            description: 'The growing season.',
            values: [{ value: 'spring', description: 'Planting time.' }, { value: 'summer' }],
          },
        },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    expect(screen.getByTestId('type-node-field-enum-affordance')).toHaveTextContent('Season enum');
    expect(screen.getByTestId('type-node-field')).toHaveAccessibleName(
      'season, Season enum, 2 values',
    );
    expect(screen.getByTestId('type-node-field-enum-summary')).toHaveStyle({
      color: 'var(--muted-foreground)',
      fontWeight: '400',
      fontFamily: 'var(--font-mono)',
    });
    fireEvent.pointerEnter(screen.getByTestId('type-node-field'));
    act(() => vi.advanceTimersByTime(120));

    expect(screen.getByText('The growing season.')).toBeInTheDocument();
    expect(screen.getByText('spring')).toBeInTheDocument();
    expect(screen.getByText('spring').closest('[title]')).toHaveAttribute(
      'title',
      'Planting time.',
    );
  });

  it('renders discriminated union refs as relationship refs with a muted suffix', () => {
    const data: TypeNodeData = {
      typeName: 'Artwork',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'sourceReference',
          summary: '→ ArtworkSourceReference',
          optional: false,
          nullable: false,
          refTarget: 'ArtworkSourceReference',
          refTargetKind: 'discriminatedUnion',
        },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    expect(screen.getByTestId('type-node-field-union-affordance')).toHaveTextContent(
      '→ ArtworkSourceReference· union',
    );
    expect(screen.getByTestId('type-node-field-ref-summary')).toHaveStyle({
      color: 'var(--graph-edge-property)',
    });
    expect(screen.getByText('· union')).toHaveStyle({
      color: 'var(--muted-foreground)',
      fontWeight: '400',
    });
  });

  it('opens inline enum details on keyboard focus', () => {
    const data: TypeNodeData = {
      typeName: 'Recipe',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'season',
          summary: '→ Season',
          optional: false,
          nullable: false,
          refTarget: 'Season',
          enumTarget: {
            name: 'Season',
            description: 'The growing season.',
            values: [{ value: 'spring' }],
          },
        },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    fireEvent.focus(screen.getByTestId('type-node-field'));

    expect(screen.getByText('The growing season.')).toBeInTheDocument();
    expect(screen.getByText('spring')).toBeInTheDocument();
  });

  it('previews ref targets on hover and focus, including enum refs', () => {
    const data: TypeNodeData = {
      typeName: 'Artwork',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'dimensions',
          summary: '→ ArtworkDimensions',
          optional: false,
          nullable: false,
          refTarget: 'ArtworkDimensions',
        },
        {
          name: 'medium',
          summary: '→ ArtworkMedium',
          optional: false,
          nullable: false,
          refTarget: 'ArtworkMedium',
          enumTarget: {
            name: 'ArtworkMedium',
            values: [{ value: 'paint' }],
          },
        },
      ],
    };
    const handler = vi.fn();
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    container.addEventListener(TYPE_NODE_REF_PREVIEW_EVENT, handler as EventListener);
    const rows = screen.getAllByTestId('type-node-field');

    fireEvent.mouseEnter(rows[0]);
    fireEvent.mouseLeave(rows[0]);
    fireEvent.focus(rows[0]);
    fireEvent.mouseEnter(rows[1]);

    expect(handler).toHaveBeenCalledTimes(4);
    expect(handler.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      {
        sourceType: 'Artwork',
        sourceField: 'dimensions',
        targetType: 'ArtworkDimensions',
        active: true,
      },
      {
        sourceType: 'Artwork',
        sourceField: 'dimensions',
        targetType: 'ArtworkDimensions',
        active: false,
      },
      {
        sourceType: 'Artwork',
        sourceField: 'dimensions',
        targetType: 'ArtworkDimensions',
        active: true,
      },
      {
        sourceType: 'Artwork',
        sourceField: 'medium',
        targetType: 'ArtworkMedium',
        active: true,
      },
    ]);
  });

  it('shows enum description and values in a hover card', () => {
    vi.useFakeTimers();
    const data: TypeNodeData = {
      typeName: 'Season',
      kind: 'enum',
      description: 'The growing season.',
      imported: false,
      enumValues: [{ value: 'spring', description: 'Planting time.' }, { value: 'summer' }],
      fields: [],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    fireEvent.pointerEnter(screen.getByTestId('type-node'));
    act(() => vi.advanceTimersByTime(120));

    expect(screen.getByText('The growing season.')).toBeInTheDocument();
    expect(screen.getByText('Values')).toBeInTheDocument();
    expect(screen.getByText('Enum')).toHaveStyle({
      color: 'color-mix(in oklch, var(--chart-3) 85%, transparent)',
    });
    expect(screen.getByText('spring')).toBeInTheDocument();
    expect(screen.getByText('summer')).toBeInTheDocument();
    expect(screen.getByText('spring').closest('[title]')).toHaveAttribute(
      'title',
      'Planting time.',
    );
    const badges = screen.getAllByTestId('enum-value-badge');
    expect(badges[0]).toHaveStyle({
      background: 'color-mix(in oklch, var(--chart-3) 85%, transparent)',
      color: 'var(--graph-node-header-text)',
    });
    expect(badges[0].getAttribute('style')).toContain(
      'border-color: color-mix(in oklch, var(--chart-3) 85%, transparent)',
    );
    expect(badges[1]).toHaveStyle({
      background: 'color-mix(in oklch, var(--chart-3) 85%, transparent)',
      color: 'var(--graph-node-header-text)',
    });
    expect(badges[1].getAttribute('style')).toContain(
      'border-color: color-mix(in oklch, var(--chart-3) 85%, transparent)',
    );
  });
});
