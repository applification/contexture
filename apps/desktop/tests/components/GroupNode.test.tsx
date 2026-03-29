import { useUIStore } from '@renderer/store/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  NodeResizer: () => null,
}));

const { GroupNode } = await import('@renderer/components/graph/nodes/GroupNode');

function resetStore() {
  useUIStore.setState({ selectedNodeId: null });
}

describe('GroupNode', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders group label', () => {
    render(
      <GroupNode
        id="group-1"
        data={{ label: 'Animals' }}
        type="group"
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
    expect(screen.getByText('Animals')).toBeInTheDocument();
  });

  it('dims when another node is selected', () => {
    useUIStore.setState({ selectedNodeId: 'other-node' });
    const { container } = render(
      <GroupNode
        id="group-1"
        data={{ label: 'Animals' }}
        type="group"
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
    const style = container.firstElementChild?.getAttribute('style') ?? '';
    expect(style).toContain('opacity: 0.2');
  });

  it('is not dimmed when it is the selected node', () => {
    useUIStore.setState({ selectedNodeId: 'group-1' });
    const { container } = render(
      <GroupNode
        id="group-1"
        data={{ label: 'Animals' }}
        type="group"
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
    const style = container.firstElementChild?.getAttribute('style') ?? '';
    expect(style).not.toContain('opacity: 0.2');
  });
});
