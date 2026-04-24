/**
 * `NewProjectDialog` — drives the New Project form. Covers:
 *   - dialog open/close controlled by the store;
 *   - project-name input live-validates via `validateProjectName`;
 *   - parent-dir button invokes `window.contexture.file.pickDirectory`;
 *   - target-path preview is `${parent}/${name}`;
 *   - Create is disabled until name is valid AND parent is chosen.
 *
 * The scaffold-start wiring + progress / success panels land in later
 * slices; here we only confirm the form shape + gating.
 */
import { NewProjectDialog } from '@renderer/components/dialogs/NewProjectDialog';
import { useNewProjectStore } from '@renderer/store/new-project';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function mockFileBridge(pickResult: string | null = null): {
  pickDirectory: ReturnType<typeof vi.fn>;
  scaffoldStart: ReturnType<typeof vi.fn>;
  fireScaffoldEvent: (event: unknown) => void;
} {
  const pickDirectory = vi.fn(async () => pickResult);
  const scaffoldStart = vi.fn(async () => undefined);
  let captured: ((event: unknown) => void) | null = null;
  (window as unknown as { contexture: unknown }).contexture = {
    chat: {},
    file: {
      openDialog: vi.fn(),
      saveAsDialog: vi.fn(),
      pickDirectory,
      save: vi.fn(),
      read: vi.fn(),
      getRecentFiles: vi.fn(),
      openRecent: vi.fn(),
      onMenuNew: () => () => undefined,
      onMenuOpen: () => () => undefined,
      onMenuSave: () => () => undefined,
      onMenuSaveAs: () => () => undefined,
      onMenuNewProject: () => () => undefined,
    },
    scaffold: {
      start: scaffoldStart,
      onEvent: (listener: (e: unknown) => void) => {
        captured = listener;
        return () => {
          captured = null;
        };
      },
    },
  };
  return {
    pickDirectory,
    scaffoldStart,
    fireScaffoldEvent: (event: unknown) => captured?.(event),
  };
}

beforeEach(() => {
  useNewProjectStore.getState().close();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NewProjectDialog', () => {
  it('is hidden when the store is closed', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    expect(screen.queryByText(/New Project/i)).not.toBeInTheDocument();
  });

  it('shows the form when the store opens', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    expect(screen.getByLabelText(/Project name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose folder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
  });

  it('shows an inline error for an invalid name', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: 'Bad Name' } });
    expect(screen.getByText(/lowercase/i)).toBeInTheDocument();
  });

  it('clears the error once the name is valid', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: 'ok-name' } });
    expect(screen.queryByText(/lowercase/i)).not.toBeInTheDocument();
  });

  it('parent-folder button calls the bridge and stores the picked path', async () => {
    const { pickDirectory } = mockFileBridge('/Users/me/projects');
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    fireEvent.click(screen.getByRole('button', { name: /Choose folder/i }));
    await waitFor(() => {
      expect(pickDirectory).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(useNewProjectStore.getState().parentDir).toBe('/Users/me/projects');
    });
  });

  it('target-path preview is parent + / + name once both are set', async () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setParentDir('/Users/me/projects');
      useNewProjectStore.getState().setName('my-proj');
    });
    expect(screen.getByText(/\/Users\/me\/projects\/my-proj/)).toBeInTheDocument();
  });

  it('Create is enabled only when name is valid AND parent is chosen', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    const create = screen.getByRole('button', { name: /^Create$/i });
    expect(create).toBeDisabled();

    // Name only — still disabled.
    act(() => {
      useNewProjectStore.getState().setName('my-proj');
    });
    expect(create).toBeDisabled();

    // Add parent — now enabled.
    act(() => {
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    expect(create).toBeEnabled();

    // Invalid name with parent — disabled again.
    act(() => {
      useNewProjectStore.getState().setName('Bad');
    });
    expect(create).toBeDisabled();
  });

  it('Create invokes scaffold.start with targetDir + projectName', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/Users/me/projects');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    await waitFor(() => {
      expect(bridge.scaffoldStart).toHaveBeenCalledWith({
        targetDir: '/Users/me/projects/my-proj',
        projectName: 'my-proj',
      });
    });
  });

  it('shows an inline preflight error when main reports preflight-failed', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/Users/me/projects');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'preflight-failed', error: { kind: 'missing-bun' } });
    });
    await waitFor(() => {
      expect(screen.getByText(/Bun is not installed/i)).toBeInTheDocument();
    });
  });

  it('shows the target-exists preflight error with the offending path', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/Users/me/projects');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({
        kind: 'preflight-failed',
        error: { kind: 'target-exists', path: '/Users/me/projects/my-proj' },
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'A folder already exists at /Users/me/projects/my-proj',
      );
    });
  });

  it('Cancel closes the dialog and resets the form', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('typed');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    const state = useNewProjectStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.name).toBe('');
    expect(state.parentDir).toBe('');
  });
});
