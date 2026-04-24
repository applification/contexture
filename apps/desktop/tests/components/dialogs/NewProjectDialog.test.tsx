/**
 * `NewProjectDialog` — tracer slice. Asserts the dialog is driven by
 * `useNewProjectStore`: hidden when `isOpen` is false, visible when
 * true, and closing the dialog flips the store.
 *
 * Later slices add assertions for the form fields, validation, the
 * progress modal state machine, and the success panel.
 */
import { NewProjectDialog } from '@renderer/components/dialogs/NewProjectDialog';
import { useNewProjectStore } from '@renderer/store/new-project';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  useNewProjectStore.getState().close();
});

afterEach(() => {
  cleanup();
});

describe('NewProjectDialog', () => {
  it('is hidden when the store is closed', () => {
    render(<NewProjectDialog />);
    expect(screen.queryByText(/New Project/i)).not.toBeInTheDocument();
  });

  it('shows the dialog when the store opens', () => {
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    expect(screen.getByText(/New Project/i)).toBeInTheDocument();
  });

  it('Cancel closes the dialog via the store', () => {
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(useNewProjectStore.getState().isOpen).toBe(false);
  });
});
