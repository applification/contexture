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
  TYPE_NODE_ADD_FIELD_EVENT,
  TYPE_NODE_EVENT,
  TYPE_NODE_OBJECT_EVENT,
  TYPE_NODE_TARGET_PROPERTIES_EVENT,
  TypeNode,
} from '@renderer/components/graph/nodes/TypeNode';
import { TYPE_NODE_REF_PREVIEW_EVENT } from '@renderer/components/graph/ref-preview-event';
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

  it('marks nodes and fields with validation issues', () => {
    const data: TypeNodeData = {
      typeName: 'Post',
      kind: 'object',
      imported: false,
      validationIssueCount: 1,
      fields: [
        {
          name: 'author',
          summary: '→ Author',
          optional: false,
          nullable: false,
          validationIssueCount: 1,
        },
      ],
    };
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    const node = container.querySelector('[data-testid="type-node"]') as HTMLElement;
    const field = screen.getByTestId('type-node-field');

    expect(node.dataset.validationIssues).toBe('true');
    expect(node).toHaveAttribute('title', '1 validation issue');
    expect(screen.getByTestId('type-node-validation-rail')).toBeInTheDocument();
    expect(field.dataset.validationIssues).toBe('true');
    expect(field.getAttribute('style')).toContain('inset 3px 0 0 var(--destructive)');
    expect(field.getAttribute('style')).toContain(
      'inset 0 -1px 0 color-mix(in oklch, var(--border) 82%, transparent)',
    );
  });

  it('raises a contexture:field-select event with typeName + fieldName when a field is clicked', () => {
    const data: TypeNodeData = {
      typeName: 'Plot',
      kind: 'object',
      imported: false,
      fields: [
        { name: 'name', summary: 'string', optional: false, nullable: false },
        { name: 'area', summary: 'number', optional: false, nullable: false },
      ],
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

  it('visually marks the selected field row', () => {
    const data: TypeNodeData = {
      typeName: 'Plot',
      kind: 'object',
      imported: false,
      fields: [
        { name: 'name', summary: 'string', optional: false, nullable: false },
        { name: 'area', summary: 'number', optional: true, nullable: false },
      ],
    };
    useGraphSelectionStore.getState().selectField({ typeName: 'Plot', fieldName: 'area' });

    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    const fields = screen.getAllByTestId('type-node-field');
    expect(fields[0].dataset.selectedField).toBeUndefined();
    expect(fields[1].dataset.selectedField).toBe('true');
    expect(fields[1]).toHaveStyle({
      background: 'color-mix(in oklch, var(--graph-node-header-bg) 12%, var(--graph-node-body-bg))',
    });
    expect(fields[1].getAttribute('style')).toContain('inset 2px 0 0 var(--graph-node-header-bg)');
    expect(fields[1].getAttribute('style')).toContain(
      'inset 0 -1px 0 color-mix(in oklch, var(--border) 82%, transparent)',
    );
    expect(screen.getByText('area?')).toHaveStyle({
      color: 'color-mix(in oklch, var(--graph-node-header-bg) 58%, var(--foreground))',
      fontWeight: '400',
    });
  });

  it('uses selection color, not table color, for selected table field rows', () => {
    const data: TypeNodeData = {
      typeName: 'Posts',
      kind: 'object',
      imported: false,
      table: true,
      fields: [{ name: 'title', summary: 'string', optional: false, nullable: false }],
    };
    useGraphSelectionStore.getState().selectField({ typeName: 'Posts', fieldName: 'title' });

    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    expect(screen.getByTestId('type-node-field')).toHaveStyle({
      background: 'color-mix(in oklch, var(--graph-node-selected) 12%, var(--graph-node-body-bg))',
    });
  });

  it('tints every field row when the parent object is selected', () => {
    const data: TypeNodeData = {
      typeName: 'Plot',
      kind: 'object',
      imported: false,
      fields: [
        { name: 'name', summary: 'string', optional: false, nullable: false },
        { name: 'area', summary: 'number', optional: false, nullable: false },
      ],
    };
    useGraphSelectionStore.getState().click('Plot', 'replace');

    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    const fields = screen.getAllByTestId('type-node-field');
    expect(fields[0]).toHaveStyle({
      background: 'color-mix(in oklch, var(--graph-node-header-bg) 5%, var(--graph-node-body-bg))',
    });
    expect(fields[1]).toHaveStyle({
      background: 'color-mix(in oklch, var(--graph-node-header-bg) 5%, var(--graph-node-body-bg))',
    });
    expect(screen.getByText('name')).toHaveStyle({
      color: 'color-mix(in oklch, var(--graph-node-header-bg) 46%, var(--foreground))',
      fontWeight: '400',
    });
    expect(fields[0].getAttribute('style')).not.toContain('inset 3px 0 0');
    expect(fields[1].getAttribute('style')).not.toContain('inset 3px 0 0');
  });

  it('uses quiet selection tint when the parent table is selected', () => {
    const data: TypeNodeData = {
      typeName: 'Posts',
      kind: 'object',
      imported: false,
      table: true,
      fields: [{ name: 'title', summary: 'string', optional: false, nullable: false }],
    };
    useGraphSelectionStore.getState().click('Posts', 'replace');

    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    const field = screen.getByTestId('type-node-field');
    expect(field).toHaveStyle({
      background: 'color-mix(in oklch, var(--graph-node-selected) 5%, var(--graph-node-body-bg))',
    });
    expect(field.getAttribute('style')).not.toContain('var(--graph-node-table-accent)');
    expect(field.getAttribute('style')).not.toContain('inset 3px 0 0');
  });

  it('uses a lighter selected-color treatment for field hover', () => {
    const data: TypeNodeData = {
      typeName: 'Plot',
      kind: 'object',
      imported: false,
      fields: [
        { name: 'name', summary: 'string', optional: false, nullable: false },
        { name: 'area', summary: 'number', optional: false, nullable: false },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    const field = screen.getAllByTestId('type-node-field')[0];
    fireEvent.mouseEnter(field);

    expect(field).toHaveStyle({
      background: 'color-mix(in oklch, var(--graph-node-header-bg) 6%, var(--graph-node-body-bg))',
    });
    expect(screen.getByText('name')).toHaveStyle({
      color: 'color-mix(in oklch, var(--graph-node-header-bg) 38%, var(--foreground))',
      fontWeight: '400',
    });
  });

  it('uses the node header as an explicit route back to object properties', () => {
    const data: TypeNodeData = {
      typeName: 'Plot',
      kind: 'object',
      imported: false,
      fields: [
        { name: 'name', summary: 'string', optional: false, nullable: false },
        { name: 'area', summary: 'number', optional: false, nullable: false },
      ],
    };
    useGraphSelectionStore.getState().selectField({ typeName: 'Plot', fieldName: 'name' });
    const handler = vi.fn();

    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    container.addEventListener(TYPE_NODE_OBJECT_EVENT, handler as EventListener);

    const header = screen.getByTestId('type-node-header');
    expect(header).toHaveAccessibleName('Show Plot object properties');
    expect(header).toHaveAttribute('title', 'Show Plot object properties');
    act(() => fireEvent.mouseOver(header));
    expect(header).toHaveStyle({ background: 'var(--graph-node-header-bg)' });
    expect(container.querySelector('[data-testid="type-node"]')?.getAttribute('style')).toContain(
      'border-color: var(--graph-node-selected)',
    );
    expect(header.getAttribute('style')).not.toContain('inset 0 -2px');
    expect(screen.getAllByTestId('type-node-field')[1]).toHaveStyle({
      background: 'color-mix(in oklch, var(--graph-node-header-bg) 3%, var(--graph-node-body-bg))',
    });

    fireEvent.click(header);

    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Plot');
    expect(useGraphSelectionStore.getState().state.selectedField).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ typeName: 'Plot' });
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
    expect(screen.queryByTestId('type-node-selection-rail')).not.toBeInTheDocument();
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

  it('raises an add-field event from local object nodes', () => {
    const data: TypeNodeData = {
      typeName: 'Plot',
      kind: 'object',
      imported: false,
      canAddFields: true,
      fields: [],
    };
    const handler = vi.fn();
    const { container } = render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });
    container.addEventListener(TYPE_NODE_ADD_FIELD_EVENT, handler as EventListener);

    fireEvent.click(screen.getByTestId('type-node-add-field'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ typeName: 'Plot' });
  });

  it('does not show add-field controls for imported object nodes', () => {
    const data: TypeNodeData = {
      typeName: 'common.Email',
      kind: 'object',
      imported: true,
      canAddFields: true,
      fields: [],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    expect(screen.queryByTestId('type-node-add-field')).not.toBeInTheDocument();
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

  it('marks field rows with modeling advice on the canvas node', () => {
    const data: TypeNodeData = {
      typeName: 'ShoppingList',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'items',
          summary: '→ ShoppingListItem[]',
          optional: false,
          nullable: false,
          refTarget: 'ShoppingListItem',
          modelingHintCount: 1,
          modelingHintTone: 'warning',
        },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    const field = screen.getByTestId('type-node-field');
    const advice = screen.getByTestId('type-node-field-advice');

    expect(field.dataset.modelingAdvice).toBe('warning');
    expect(advice).toHaveAttribute('title', '1 modeling advisory');
    expect(advice.getAttribute('style')).toContain('var(--warning)');
    expect(screen.getByTestId('type-node-field-ref-summary')).toHaveTextContent(
      '→ ShoppingListItem[]',
    );
  });

  it('keeps low-pressure modeling advice out of canvas field rows', () => {
    const data: TypeNodeData = {
      typeName: 'Post',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'title',
          summary: 'string',
          optional: false,
          nullable: false,
          modelingHintCount: 1,
          modelingHintTone: 'advisory',
        },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    expect(screen.getByTestId('type-node-field').dataset.modelingAdvice).toBeUndefined();
    expect(screen.queryByTestId('type-node-field-advice')).not.toBeInTheDocument();
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

  it('renders stdlib refs as inline affordances with hover details', () => {
    const data: TypeNodeData = {
      typeName: 'User',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'email',
          summary: '→ common.Email',
          optional: false,
          nullable: false,
          refTarget: 'common.Email',
          stdlibTarget: {
            name: 'common.Email',
            description: 'Email address.',
            kind: 'raw',
          },
        },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    expect(screen.getByTestId('type-node-field-stdlib-affordance')).toHaveTextContent(
      'common.Email',
    );
    expect(screen.getByTestId('type-node-field')).toHaveAccessibleName(
      'email, common.Email stdlib type',
    );
    expect(screen.getByTestId('type-node-field-stdlib-summary')).toHaveStyle({
      color: 'color-mix(in oklch, var(--chart-2) 85%, transparent)',
      fontWeight: '400',
      fontFamily: 'var(--font-mono)',
    });

    fireEvent.focus(screen.getByTestId('type-node-field'));

    expect(screen.getByText('Email address.')).toBeInTheDocument();
    expect(screen.getByTestId('type-node-field-stdlib-hover-card').getAttribute('style')).toContain(
      'border-top: 2px solid color-mix(in oklch, var(--chart-2) 85%, transparent)',
    );
    expect(screen.getByText('Stdlib raw')).toBeInTheDocument();
    expect(screen.getByTestId('stdlib-kind-label')).toHaveStyle({
      color: 'color-mix(in oklch, var(--chart-2) 85%, transparent)',
    });
  });

  it('opens stdlib target properties from the hover card action', () => {
    const data: TypeNodeData = {
      typeName: 'User',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'email',
          summary: '→ common.Email',
          optional: false,
          nullable: false,
          refTarget: 'common.Email',
          stdlibTarget: {
            name: 'common.Email',
            description: 'Email address.',
            kind: 'raw',
          },
        },
      ],
    };
    const handler = vi.fn();
    document.addEventListener(TYPE_NODE_TARGET_PROPERTIES_EVENT, handler as EventListener);
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    fireEvent.focus(screen.getByTestId('type-node-field'));
    fireEvent.click(screen.getByRole('button', { name: 'Show common.Email properties' }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
      typeName: 'common.Email',
    });
    document.removeEventListener(TYPE_NODE_TARGET_PROPERTIES_EVENT, handler as EventListener);
  });

  it('uses blue stdlib hover accents and value badges', () => {
    vi.useFakeTimers();
    const data: TypeNodeData = {
      typeName: 'User',
      kind: 'object',
      imported: false,
      fields: [
        {
          name: 'country',
          summary: '→ place.CountryCode',
          optional: false,
          nullable: false,
          refTarget: 'place.CountryCode',
          stdlibTarget: {
            name: 'place.CountryCode',
            description: 'ISO 3166-1 alpha-2 country code.',
            kind: 'enum',
            values: [{ value: 'GB', description: 'United Kingdom' }, { value: 'US' }],
          },
        },
      ],
    };
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    fireEvent.pointerEnter(screen.getByTestId('type-node-field'));
    act(() => vi.advanceTimersByTime(120));

    expect(screen.getByTestId('stdlib-kind-label')).toHaveStyle({
      color: 'color-mix(in oklch, var(--chart-2) 85%, transparent)',
    });
    expect(screen.getByText('GB')).toBeInTheDocument();
    expect(screen.getByText('GB').closest('[title]')).toHaveAttribute('title', 'United Kingdom');
    const badges = screen.getAllByTestId('stdlib-value-badge');
    expect(badges[0]).toHaveStyle({
      background: 'color-mix(in oklch, var(--chart-2) 85%, transparent)',
      color: 'var(--graph-node-header-text)',
    });
    expect(badges[0].getAttribute('style')).toContain(
      'border-color: color-mix(in oklch, var(--chart-2) 85%, transparent)',
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
      color: 'var(--graph-edge-ref)',
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

  it('opens enum target properties from the hover card action', () => {
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
            values: [{ value: 'spring' }],
          },
        },
      ],
    };
    const handler = vi.fn();
    document.addEventListener(TYPE_NODE_TARGET_PROPERTIES_EVENT, handler as EventListener);
    render(<TypeNode {...makeProps(data)} />, { wrapper: Wrapper });

    fireEvent.focus(screen.getByTestId('type-node-field'));
    fireEvent.click(screen.getByRole('button', { name: 'Show Season properties' }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ typeName: 'Season' });
    document.removeEventListener(TYPE_NODE_TARGET_PROPERTIES_EVENT, handler as EventListener);
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
