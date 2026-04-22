/**
 * DocumentDialogs — all three variants routed off `useDocumentStore`.
 * Tests drive the store directly and assert the right UI appears, and
 * the right store mutations happen on user actions.
 */
import { DocumentDialogs } from '@renderer/components/dialogs/DocumentDialogs';
import { useDocumentStore } from '@renderer/store/document';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  // Reset the store between tests so one test's dialog doesn't leak.
  const s = useDocumentStore.getState();
  s.clearImportWarnings();
  s.clearUnknownFormat();
  s.clearSaveWithErrors();
});

afterEach(() => {
  cleanup();
});

describe('DocumentDialogs', () => {
  it('shows the import-warnings dialog when warnings are present', () => {
    render(<DocumentDialogs />);
    act(() => {
      useDocumentStore.getState().showImportWarnings([
        { message: 'Migration v0 → v1 applied', severity: 'warning' },
        { message: 'Layout sidecar discarded', severity: 'warning' },
      ]);
    });
    expect(screen.getByText(/Import warnings/i)).toBeInTheDocument();
    expect(screen.getByText(/Migration v0 → v1/)).toBeInTheDocument();
    expect(screen.getByText(/Layout sidecar/)).toBeInTheDocument();
  });

  it('OK clears import warnings', () => {
    render(<DocumentDialogs />);
    act(() => {
      useDocumentStore
        .getState()
        .showImportWarnings([{ message: 'anything', severity: 'warning' }]);
    });
    fireEvent.click(screen.getByRole('button', { name: /ok/i }));
    expect(useDocumentStore.getState().importWarnings).toEqual([]);
  });

  it('shows the unknown-format dialog with the offending path', () => {
    render(<DocumentDialogs />);
    act(() => {
      useDocumentStore.getState().showUnknownFormat('/tmp/weird.jsonld');
    });
    expect(screen.getByText(/Not a Contexture file/i)).toBeInTheDocument();
    expect(screen.getByText('/tmp/weird.jsonld')).toBeInTheDocument();
  });

  it('shows the save-with-errors dialog and fires onForceSave on "Save anyway"', () => {
    const onForceSave = vi.fn();
    render(<DocumentDialogs onForceSave={onForceSave} />);
    act(() => {
      useDocumentStore.getState().showSaveWithErrors({
        id: 'save-1',
        messages: ['Unresolved ref "OhNo"'],
      });
    });
    expect(screen.getByText(/Save with errors/i)).toBeInTheDocument();
    expect(screen.getByText(/Unresolved ref "OhNo"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save anyway/i }));
    expect(onForceSave).toHaveBeenCalledWith('save-1');
    expect(useDocumentStore.getState().saveWithErrorsPrompt).toBeNull();
  });

  it('"Cancel" on save-with-errors clears the prompt without calling onForceSave', () => {
    const onForceSave = vi.fn();
    render(<DocumentDialogs onForceSave={onForceSave} />);
    act(() => {
      useDocumentStore.getState().showSaveWithErrors({
        id: 'save-2',
        messages: ['bad'],
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onForceSave).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().saveWithErrorsPrompt).toBeNull();
  });
});
