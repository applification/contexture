import { ReviewPanel } from '@renderer/components/review/ReviewPanel';
import { useChatComposerStore } from '@renderer/store/chat-composer';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const schema = {
  version: '1',
  metadata: { name: 'Ops' },
  types: [
    { kind: 'object', name: 'Tenant', table: true, fields: [] },
    {
      kind: 'object',
      name: 'Project',
      table: true,
      fields: [
        { name: 'tenantId', type: { kind: 'ref', typeName: 'Tenant' } },
        { name: 'searchText', type: { kind: 'string' } },
        { name: 'tags', type: { kind: 'array', element: { kind: 'string' } } },
      ],
      indexes: [{ name: 'by_tenant', fields: ['tenantId'] }],
      invariants: [
        {
          kind: 'fieldPredicate',
          name: 'search-text-required',
          field: 'searchText',
          predicate: { kind: 'nonEmptyTrimmedString' },
        },
      ],
    },
  ],
} as const;

describe('ReviewPanel', () => {
  beforeEach(() => {
    useGraphSelectionStore.getState().clear();
    useUIChromeStore.getState().setSidebarVisible(true);
    useUIChromeStore.getState().setSidebarTab('review');
    useChatComposerStore.getState().setPendingChatMessage(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows unresolved review items and declared model contracts', async () => {
    const user = userEvent.setup();
    render(<ReviewPanel schema={schema} />);

    expect(screen.getByText('Domain review')).toBeInTheDocument();
    expect(screen.getByText('Bounded array scan')).toBeInTheDocument();
    expect(screen.getByText('Project.tags')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Declared' }));
    expect(screen.getByText('search-text-required')).toBeInTheDocument();
    expect(screen.getByText('Project.by_tenant')).toBeInTheDocument();
  });

  it('focuses affected fields from unresolved items', () => {
    render(<ReviewPanel schema={schema} />);
    const row = boundedArrayScanRow();
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Focus' }));

    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Project');
    expect(useGraphSelectionStore.getState().state.selectedField).toEqual({
      typeName: 'Project',
      fieldName: 'tags',
    });
    expect(useUIChromeStore.getState().sidebarTab).toBe('review');
    expect(useUIChromeStore.getState().sidebarVisible).toBe(true);
  });

  it('seeds chat with review context', () => {
    render(<ReviewPanel schema={schema} />);
    const row = boundedArrayScanRow();
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Discuss' }));

    expect(useChatComposerStore.getState().pendingChatMessage?.message).toContain(
      'Review this Contexture domain decision: Bounded array scan',
    );
    expect(useChatComposerStore.getState().pendingChatMessage?.context).toBe('');
    expect(useUIChromeStore.getState().sidebarTab).toBe('chat');
  });
});

function boundedArrayScanRow(): HTMLElement {
  const row = screen
    .getAllByText('Bounded array scan')[0]
    ?.closest('[data-testid="review-unresolved-item"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}
