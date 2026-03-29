import { ContextMenu } from '@renderer/components/graph/ContextMenu';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ContextMenu', () => {
  afterEach(cleanup);

  it('renders menu items', () => {
    const items = [
      { label: 'Edit', action: vi.fn() },
      { label: 'Delete', action: vi.fn(), destructive: true },
    ];
    render(<ContextMenu x={100} y={200} items={items} onClose={() => {}} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls action and onClose when item clicked', () => {
    const action = vi.fn();
    const onClose = vi.fn();
    const items = [{ label: 'Edit', action }];
    render(<ContextMenu x={100} y={200} items={items} onClose={onClose} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders separator items', () => {
    const items = [
      { label: 'Edit', action: vi.fn() },
      { label: '', action: () => {}, separator: true },
      { label: 'Delete', action: vi.fn() },
    ];
    render(<ContextMenu x={100} y={200} items={items} onClose={() => {}} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={[{ label: 'X', action: vi.fn() }]} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on click outside', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={[{ label: 'X', action: vi.fn() }]} onClose={onClose} />);
    fireEvent.mouseDown(document);
    expect(onClose).toHaveBeenCalled();
  });
});
