/**
 * `NewProjectDialog` — drives the New Project form. Covers:
 *   - dialog open/close controlled by the store;
 *   - project-name input live-validates via `validateProjectName`;
 *   - parent-dir button invokes `window.contexture.file.pickDirectory`;
 *   - target-path preview is `${parent}/${name}`;
 *   - app picker checkboxes (web pre-checked, mobile/desktop unchecked);
 *   - Create is disabled until name is valid AND parent is chosen AND
 *     at least one app is selected.
 */
import { STAGE } from '@main/scaffold/scaffold-project';
import { NewProjectDialog } from '@renderer/components/dialogs/NewProjectDialog';
import { useNewProjectStore } from '@renderer/store/new-project';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function mockFileBridge(pickResult: string | null = null): {
  pickDirectory: ReturnType<typeof vi.fn>;
  scaffoldStart: ReturnType<typeof vi.fn>;
  shellReveal: ReturnType<typeof vi.fn>;
  shellOpenInEditor: ReturnType<typeof vi.fn>;
  projectDeleteDir: ReturnType<typeof vi.fn>;
  fireScaffoldEvent: (event: unknown) => void;
} {
  const pickDirectory = vi.fn(async () => pickResult);
  const scaffoldStart = vi.fn(async () => undefined);
  const shellReveal = vi.fn(async () => undefined);
  const shellOpenInEditor = vi.fn(async () => undefined);
  const projectDeleteDir = vi.fn(async () => undefined);
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
      openInEditor: shellOpenInEditor,
    },
    project: {
      deleteDirectory: projectDeleteDir,
    },
  };
  return {
    pickDirectory,
    scaffoldStart,
    shellReveal,
    shellOpenInEditor,
    projectDeleteDir,
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

  it('app picker shows Web pre-checked, Mobile and Desktop unchecked', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    expect(screen.getByRole('checkbox', { name: /Web/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Mobile/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Desktop/i })).not.toBeChecked();
  });

  it('Create is disabled when no apps are selected', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    // Uncheck Web (the only pre-checked app)
    fireEvent.click(screen.getByRole('checkbox', { name: /Web/i }));
    expect(screen.getByRole('button', { name: /^Create$/i })).toBeDisabled();
    expect(screen.getByText('Select at least one app.')).toBeInTheDocument();
  });

  it('Create is enabled when name, parent, and at least one app are set', () => {
    mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
    });
    const create = screen.getByRole('button', { name: /^Create$/i });
    expect(create).toBeDisabled();

    act(() => {
      useNewProjectStore.getState().setName('my-proj');
    });
    expect(create).toBeDisabled();

    act(() => {
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    // Web is pre-checked so now all conditions are met.
    expect(create).toBeEnabled();

    // Invalid name — disabled again.
    act(() => {
      useNewProjectStore.getState().setName('Bad');
    });
    expect(create).toBeDisabled();
  });

  it('Create invokes scaffold.start with targetDir, projectName, and selected apps', async () => {
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
        apps: ['web'],
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

  it('switches to the progress view on stage-start and shows stage labels', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: STAGE.TURBO_SKELETON });
    });
    await waitFor(() => {
      expect(screen.getByText(/Scaffolding monorepo/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Installing dependencies/i)).toBeInTheDocument();
    expect(screen.getByText(/Seeding initial IR/i)).toBeInTheDocument();
  });

  it('shows web-specific stages (Next.js, shadcn) when web is selected', async () => {
    const bridge = mockFileBridge();
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    act(() => {
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: STAGE.TURBO_SKELETON });
    });
    await waitFor(() => {
      expect(screen.getByText(/Installing Next\.js/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Adding shadcn\/ui/i)).toBeInTheDocument();
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
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: STAGE.TURBO_SKELETON });
      bridge.fireScaffoldEvent({ kind: 'stage-done', stage: STAGE.TURBO_SKELETON });
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: STAGE.WEB_NEXT });
    });
    await waitFor(() => {
      expect(screen.getByTestId(`scaffold-stage-${STAGE.TURBO_SKELETON}`)).toHaveAttribute(
        'data-status',
        'done',
      );
    });
    expect(screen.getByTestId(`scaffold-stage-${STAGE.WEB_NEXT}`)).toHaveAttribute(
      'data-status',
      'running',
    );
    expect(screen.getByTestId(`scaffold-stage-${STAGE.WEB_SHADCN}`)).toHaveAttribute(
      'data-status',
      'pending',
    );
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
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: STAGE.TURBO_SKELETON });
      bridge.fireScaffoldEvent({
        kind: 'stdout-chunk',
        stage: STAGE.TURBO_SKELETON,
        chunk: 'creating apps/...\n',
      });
      bridge.fireScaffoldEvent({
        kind: 'stderr-chunk',
        stage: STAGE.TURBO_SKELETON,
        chunk: 'warn: something\n',
      });
    });
    await waitFor(() => {
      const log = screen.getByTestId('scaffold-log');
      expect(log.textContent).toContain('creating apps/...');
      expect(log.textContent).toContain('warn: something');
    });
  });

  it('closes the dialog and calls onOpenProject with the IR path when scaffold-done fires', async () => {
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
      expect(useNewProjectStore.getState().isOpen).toBe(false);
    });
    expect(onOpenProject).toHaveBeenCalledWith(
      '/tmp/my-proj/packages/schema/my-proj.contexture.json',
    );
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
      bridge.fireScaffoldEvent({ kind: 'stage-start', stage: STAGE.WEB_NEXT });
      bridge.fireScaffoldEvent({
        kind: 'stage-failed',
        stage: STAGE.WEB_NEXT,
        stderr: 'next-app exited 1',
        retrySafe: true,
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
        stage: STAGE.TURBO_SKELETON,
        stderr: 'boom',
        retrySafe: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('scaffold-failure')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Try again/i })).toBeDisabled();
  });

  it('Delete and start over removes the target dir and returns to the form', async () => {
    const bridge = mockFileBridge();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    act(() => {
      bridge.fireScaffoldEvent({
        kind: 'stage-failed',
        stage: STAGE.WEB_NEXT,
        stderr: 'boom',
        retrySafe: true,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete and start over/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Delete and start over/i }));
    await waitFor(() => {
      expect(bridge.projectDeleteDir).toHaveBeenCalledWith('/tmp/my-proj');
    });
    await waitFor(() => {
      expect(useNewProjectStore.getState().phase).toBe('form');
    });
    expect(useNewProjectStore.getState().failure).toBeNull();
    confirmSpy.mockRestore();
  });

  it('Delete and start over is a no-op when the user cancels the confirm', async () => {
    const bridge = mockFileBridge();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<NewProjectDialog />);
    act(() => {
      useNewProjectStore.getState().open();
      useNewProjectStore.getState().setName('my-proj');
      useNewProjectStore.getState().setParentDir('/tmp');
    });
    act(() => {
      bridge.fireScaffoldEvent({
        kind: 'stage-failed',
        stage: STAGE.WEB_NEXT,
        stderr: 'boom',
        retrySafe: true,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete and start over/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Delete and start over/i }));
    expect(bridge.projectDeleteDir).not.toHaveBeenCalled();
    expect(useNewProjectStore.getState().phase).toBe('failed');
    confirmSpy.mockRestore();
  });

  it('Open folder on the failure panel reveals the target folder', async () => {
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
        stage: STAGE.WEB_NEXT,
        stderr: 'boom',
        retrySafe: true,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Open folder/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Open folder/i }));
    await waitFor(() => {
      expect(bridge.shellReveal).toHaveBeenCalledWith('/tmp/my-proj');
    });
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
        stage: STAGE.CONVEX_INIT,
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
      apps: ['web'],
    });
  });

  it('closes the dialog even when no onOpenProject is provided', async () => {
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
      expect(useNewProjectStore.getState().isOpen).toBe(false);
    });
  });

  it('scaffold-done closes the dialog and resets the store', async () => {
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
      expect(useNewProjectStore.getState().isOpen).toBe(false);
    });
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
