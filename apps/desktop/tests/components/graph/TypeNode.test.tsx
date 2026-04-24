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
import { TYPE_NODE_EVENT, TypeNode } from '@renderer/components/graph/nodes/TypeNode';
import type { TypeNodeData } from '@renderer/components/graph/schema-to-graph';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(cleanup);

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
});
