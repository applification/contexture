import { useUIStore } from '@renderer/store/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  NodeResizer: () => null,
}));

const { ClassNode } = await import('@renderer/components/graph/nodes/ClassNode');

function resetStore() {
  useUIStore.setState({
    selectedNodeId: null,
    adjacentNodeIds: [],
    graphFilters: {
      showSubClassOf: true,
      showDisjointWith: true,
      showObjectProperties: true,
      showDatatypeProperties: true,
      minDegree: 0,
    },
  });
}

describe('ClassNode', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders class label', () => {
    render(
      <ClassNode
        id="http://ex/Person"
        data={{ label: 'Person', uri: 'http://ex/Person', datatypeProperties: [] }}
        type="class"
        dragging={false}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        zIndex={0}
        selected={false}
        dragHandle=""
        parentId=""
        sourcePosition={undefined}
        targetPosition={undefined}
      />,
    );
    expect(screen.getByText('Person')).toBeInTheDocument();
  });

  it('renders datatype properties when filter enabled', () => {
    render(
      <ClassNode
        id="http://ex/Person"
        data={{
          label: 'Person',
          uri: 'http://ex/Person',
          datatypeProperties: [{ uri: 'http://ex/name', label: 'name', range: 'string' }],
        }}
        type="class"
        dragging={false}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        zIndex={0}
        selected={false}
        dragHandle=""
        parentId=""
        sourcePosition={undefined}
        targetPosition={undefined}
      />,
    );
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('string')).toBeInTheDocument();
  });

  it('hides datatype properties when filter disabled', () => {
    useUIStore.setState({
      graphFilters: {
        showSubClassOf: true,
        showDisjointWith: true,
        showObjectProperties: true,
        showDatatypeProperties: false,
        minDegree: 0,
      },
    });
    render(
      <ClassNode
        id="http://ex/Person"
        data={{
          label: 'Person',
          uri: 'http://ex/Person',
          datatypeProperties: [{ uri: 'http://ex/name', label: 'name', range: 'string' }],
        }}
        type="class"
        dragging={false}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        zIndex={0}
        selected={false}
        dragHandle=""
        parentId=""
        sourcePosition={undefined}
        targetPosition={undefined}
      />,
    );
    expect(screen.queryByText('name')).not.toBeInTheDocument();
  });

  it('applies selected styling', () => {
    useUIStore.setState({ selectedNodeId: 'http://ex/Person' });
    const { container } = render(
      <ClassNode
        id="http://ex/Person"
        data={{ label: 'Person', uri: 'http://ex/Person', datatypeProperties: [] }}
        type="class"
        dragging={false}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        zIndex={0}
        selected={false}
        dragHandle=""
        parentId=""
        sourcePosition={undefined}
        targetPosition={undefined}
      />,
    );
    const node = container.querySelector('.ontograph-class-node') as Element;
    expect(node.getAttribute('style')).toContain('selected');
  });

  it('dims non-selected non-adjacent nodes when something is selected', () => {
    useUIStore.setState({ selectedNodeId: 'http://ex/Other', adjacentNodeIds: [] });
    const { container } = render(
      <ClassNode
        id="http://ex/Person"
        data={{ label: 'Person', uri: 'http://ex/Person', datatypeProperties: [] }}
        type="class"
        dragging={false}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        zIndex={0}
        selected={false}
        dragHandle=""
        parentId=""
        sourcePosition={undefined}
        targetPosition={undefined}
      />,
    );
    const node = container.querySelector('.ontograph-class-node') as Element;
    expect(node.getAttribute('style')).toContain('opacity: 0.2');
  });
});
