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
  shellReveal: ReturnType<typeof vi.fn>;
  fireScaffoldEvent: (event: unknown) => void;
} {
  const pickDirectory = vi.fn(async () => pickResult);
  const scaffoldStart = vi.fn(async () => undefined);
  const shellReveal = vi.fn(async () => undefined);
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
    shell: {
      reveal: shellReveal,
    },
  };
  return {
    pickDirectory,
    scaffoldStart,
    shellReveal,
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

  it('Create is enabled only when name is valid AND parent is chosen AND starting-point is valid', () => {
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

    // Name + parent, no starting point — still disabled.
    act(() => {
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    expect(create).toBeDisabled();

    // Add describe + description — now enabled.
    act(() => {
      useNewProjectStore.getState().setStartingPoint('describe');
      useNewProjectStore.getState().setDescription('a blog');
    });
    expect(create).toBeEnabled();

    // Invalid name with everything else — disabled again.
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
      useNewProjectStore.getState().setStartingPoint('describe');
      useNewProjectStore.getState().setDescription('a blog');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    await waitFor(() => {
      expect(bridge.scaffoldStart).toHaveBeenCalledWith({
        targetDir: '/Users/me/projects/my-proj',
        projectName: 'my-proj',
      });
    });
  });

  it('renders both starting-point radios; promote-scratch is disabled with #124 hint', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    const describe = screen.getByLabelText(/Describe what you're building/i);
    const promote = screen.getByLabelText(/Promote an existing scratch/i);
    expect(describe).toBeEnabled();
    expect(promote).toBeDisabled();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('Create is disabled until a starting point is chosen (even with name+parent)', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
    act(() => {
      useNewProjectStore.getState().setStartingPoint('describe');
      useNewProjectStore.getState().setDescription('a blog');
    });
    expect(screen.getByRole('button', { name: /^Create$/i })).toBeEnabled();
  });

  it('describe path requires a non-empty description', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
      useNewProjectStore.getState().setStartingPoint('describe');
    });
    expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Describe your project/i), {
      target: { value: 'a photo app' },
    });
    expect(screen.getByRole('button', { name: /^Create$/i })).toBeEnabled();
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

  it('switches to the progress view on stage-start and shows all ten stage labels', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: 1 });
    });
    await waitFor(() => {
      expect(screen.getByText(/Scaffolding monorepo/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Installing dependencies/i)).toBeInTheDocument();
    expect(screen.getByText(/Seeding initial IR/i)).toBeInTheDocument();
  });

  it('flips the active row to running and previous rows to done as events arrive', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: 1 });
      bridge.fireScaffoldEvent({ kind: 'stage-done', stage: 1 });
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: 2 });
    });
    await waitFor(() => {
      const row1 = screen.getByTestId('scaffold-stage-1');
      expect(row1).toHaveAttribute('data-status', 'done');
    });
    expect(screen.getByTestId('scaffold-stage-2')).toHaveAttribute('data-status', 'running');
    expect(screen.getByTestId('scaffold-stage-3')).toHaveAttribute('data-status', 'pending');
  });

  it('appends stdout/stderr chunks to the streaming log', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: 1 });
      bridge.fireScaffoldEvent({
        kind: 'stdout-chunk',
        stage: 1,
        chunk: 'creating apps/...\n',
      });
      bridge.fireScaffoldEvent({
        kind: 'stderr-chunk',
        stage: 1,
        chunk: 'warn: something\n',
      });
    });
    await waitFor(() => {
      const log = screen.getByTestId('scaffold-log');
      expect(log.textContent).toContain('creating apps/...');
      expect(log.textContent).toContain('warn: something');
    });
  });

  it('transitions to the success panel when scaffold-done fires', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: 1 });
      bridge.fireScaffoldEvent({ kind: 'stage-done', stage: 1 });
      bridge.fireScaffoldEvent({ kind: 'scaffold-done' });
    });
    await waitFor(() => {
      expect(useNewProjectStore.getState().phase).toBe('done');
    });
  });

  it('shows the success panel with the target path when phase is done', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'scaffold-done' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('scaffold-success')).toBeInTheDocument();
    });
    expect(screen.getByTestId('scaffold-success')).toHaveTextContent('/tmp/my-proj');
  });

  it('shows the failure panel with the failed stage label when stage-failed fires', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: 3 });
      bridge.fireScaffoldEvent({
        kind: 'stage-failed',
        stage: 3,
        stderr: 'next-app exited 1',
        retrySafe: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('scaffold-failure')).toBeInTheDocument();
    });
    expect(screen.getByTestId('scaffold-failure')).toHaveTextContent(/Installing Next\.js/i);
  });

  it('Try again is disabled when the failed stage is not retry-safe', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({
        kind: 'stage-failed',
        stage: 2,
        stderr: 'boom',
        retrySafe: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('scaffold-failure')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Try again/i })).toBeDisabled();
  });

  it('Try again is enabled and restarts the scaffolder when the failed stage is retry-safe', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    act(() => {
      bridge.fireScaffoldEvent({
        kind: 'stage-failed',
        stage: 6,
        stderr: 'convex hiccup',
        retrySafe: true,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Try again/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
    await waitFor(() => {
      expect(bridge.scaffoldStart).toHaveBeenCalledTimes(1);
    });
    expect(bridge.scaffoldStart).toHaveBeenCalledWith({
      targetDir: '/tmp/my-proj',
      projectName: 'my-proj',
    });
  });

  it('Copy path writes the target path to the clipboard', async () => {
    const bridge = mockFileBridge();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'scaffold-done' });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy path/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Copy path/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('/tmp/my-proj');
    });
  });

  it('Reveal on the success panel reveals the target folder', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'scaffold-done' });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reveal/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Reveal/i }));
    await waitFor(() => {
      expect(bridge.shellReveal).toHaveBeenCalledWith('/tmp/my-proj');
    });
  });

  it('Close on the success panel opens the scaffolded IR before closing', async () => {
    const bridge = mockFileBridge();
    const onOpenProject = vi.fn();
    render(<NewProjectDialog onOpenProject={onOpenProject} />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'scaffold-done' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('scaffold-success-close')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('scaffold-success-close'));
    expect(onOpenProject).toHaveBeenCalledWith(
      '/tmp/my-proj/packages/schema/my-proj.contexture.json',
    );
    expect(useNewProjectStore.getState().isOpen).toBe(false);
  });

  it('Close on the success panel closes and resets the store', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'scaffold-done' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('scaffold-success-close')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('scaffold-success-close'));
    expect(useNewProjectStore.getState().isOpen).toBe(false);
    expect(useNewProjectStore.getState().name).toBe('');
    expect(useNewProjectStore.getState().phase).toBe('form');
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
