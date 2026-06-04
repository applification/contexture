import App from '@renderer/App';
import { useDocumentStore } from '@renderer/store/document';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unsub = () => undefined;

beforeEach(() => {
  localStorage.clear();
  useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  while (useUndoStore.getState().canUndo) useUndoStore.getState().undo();
  useDocumentStore.getState().resetForNewBundle();
  useGraphSelectionStore.getState().clear();
  useUIChromeStore.getState().setSidebarVisible(true);
  useUIChromeStore.getState().setSidebarTab('chat');
  useUIChromeStore.getState().setPlaygroundScope({ mode: 'all' });
  (window as unknown as { contexture: unknown }).contexture = {
    file: {
      openDialog: vi.fn(async () => null),
      saveAsDialog: vi.fn(async () => null),
      pickDirectory: vi.fn(async () => null),
      pickContextureFile: vi.fn(async () => null),
      pickChatContextFiles: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      read: vi.fn(async () => null),
      getRecentFiles: vi.fn(async () => []),
      openRecent: vi.fn(async () => null),
      onMenuNew: () => unsub,
      onMenuOpen: () => unsub,
      onMenuSave: () => unsub,
      onMenuSaveAs: () => unsub,
    },
    schemaAgent: {
      send: vi.fn(async () => ({ ok: true })),
      setIR: vi.fn(),
      abort: vi.fn(async () => ({ ok: true })),
      getStatus: vi.fn(async () => ({ provider: 'codex', readiness: 'authenticated_chatgpt' })),
      listModels: vi.fn(async () => [{ id: 'gpt-5.4', label: 'GPT-5.4' }]),
      setProvider: vi.fn(async () => ({ ok: true })),
      setModelOptions: vi.fn(async () => ({ ok: true })),
      startLogin: vi.fn(async () => ({ id: 'login-1', mode: 'chatgpt' })),
      cancelLogin: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      threadSet: vi.fn(async () => ({ ok: true })),
      threadClear: vi.fn(async () => ({ ok: true })),
      replyTool: vi.fn(),
      onAssistantDelta: () => unsub,
      onAssistantFinal: () => unsub,
      onToolCallStarted: () => unsub,
      onToolCallFinished: () => unsub,
      onError: () => unsub,
      onStatusChanged: () => unsub,
      onThreadUpdated: () => unsub,
      onThreadDesynced: () => unsub,
      onToolRequest: () => unsub,
      onTurnBegin: () => unsub,
      onTurnCommit: () => unsub,
      onTurnRollback: () => unsub,
    },
    convex: {
      versionInfo: vi.fn(async () => ({
        emitterVersion: '1.40.0',
        targetVersion: '1.40.0',
        targetPackagePath: '/Users/rufus/Apps/todo/package.json',
        status: 'ok',
        message: 'Contexture emitter and target app Convex versions match.',
      })),
      agentReadiness: vi.fn(async () => ({
        convexAiFiles: {
          status: 'ready',
          message: 'Convex AI files: enabled',
          command: 'bunx convex ai-files status',
        },
        contextureMcp: {
          status: 'ready',
          message: 'contexture enabled',
          command: 'codex mcp list',
        },
      })),
    },
  };
});

afterEach(() => {
  cleanup();
});

describe('App Codex-first copy', () => {
  it('offers task-oriented onboarding entry points', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Create new Convex model')).toBeInTheDocument();
    });
    expect(screen.getByText('Open existing model')).toBeInTheDocument();
    expect(screen.getByText('Inspect sample Convex model')).toBeInTheDocument();
    expect(screen.getByText('Work with Codex')).toBeInTheDocument();
  });

  it('loads the Convex sample from the start screen', async () => {
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-load-sample'));

    await waitFor(() => {
      expect(useUndoStore.getState().schema.types.map((type) => type.name)).toContain('Sowing');
    });
    const sowing = useUndoStore.getState().schema.types.find((type) => type.name === 'Sowing');
    expect(sowing).toMatchObject({
      kind: 'object',
      table: true,
    });
    expect(sowing?.kind === 'object' ? sowing.indexes : []).toContainEqual({
      name: 'by_plot',
      fields: ['plot'],
    });
    useDocumentStore.getState().setFilePath('/Users/rufus/Apps/todo/todo.contexture.json');
    expect(useUIChromeStore.getState().sidebarTab).toBe('schema');
    expect(screen.getByTestId('onboarding-loop')).toHaveTextContent('Project readiness');
    expect(screen.getByLabelText(/Model: Table: ready/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Generated: Files visible: ready/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Saved: needs action/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/Agent: Convex AI files: ready/)).toHaveTextContent('2/2');
    });
  });

  it('keeps the inspector floating on the canvas with compact chrome', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-load-sample'));

    const inspector = await screen.findByLabelText('Properties inspector');
    expect(inspector).toHaveTextContent('Inspector');
    expect(inspector).toHaveTextContent('Select a type on the canvas');

    await user.click(screen.getByRole('button', { name: 'Collapse inspector' }));
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toBeInTheDocument();
    expect(inspector).not.toHaveTextContent('Select a type on the canvas');
    expect(useUIChromeStore.getState().sidebarTab).toBe('schema');
  });

  it('opens the selected type in the Playground drawer from the inspector', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-load-sample'));
    useGraphSelectionStore.getState().click('Sowing', 'replace');

    await waitFor(() => {
      expect(screen.getByLabelText('Properties inspector')).toHaveTextContent('Sowing');
    });
    await user.click(screen.getByRole('button', { name: 'Try' }));

    expect(useUIChromeStore.getState().sidebarTab).toBe('playground');
    expect(useUIChromeStore.getState().playgroundScope).toEqual({
      mode: 'selected',
      typeName: 'Sowing',
    });
    expect(
      screen.getByText('Inspector selection is highlighted in the model.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select entity' })).toHaveTextContent('Sowing');
  });

  it('uses the floating inspector header as field breadcrumb navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-load-sample'));
    useGraphSelectionStore.getState().click('Sowing', 'replace');
    useGraphSelectionStore.getState().selectField({ typeName: 'Sowing', fieldName: 'plot' });

    await waitFor(() => {
      expect(screen.getByLabelText('Properties inspector')).toHaveTextContent('plot');
    });
    expect(screen.queryByTestId('field-detail-header')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Sowing fields' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to Sowing fields' }));

    expect(useGraphSelectionStore.getState().state.selectedField).toBeNull();
    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Sowing');
  });

  it('deletes the selected field from the floating inspector header', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-load-sample'));
    useGraphSelectionStore.getState().click('Sowing', 'replace');
    useGraphSelectionStore.getState().selectField({ typeName: 'Sowing', fieldName: 'plot' });

    await user.click(await screen.findByRole('button', { name: 'Delete field plot' }));

    const sowing = useUndoStore.getState().schema.types.find((type) => type.name === 'Sowing');
    expect(sowing).toMatchObject({
      kind: 'object',
      fields: expect.not.arrayContaining([expect.objectContaining({ name: 'plot' })]),
    });
    expect(useGraphSelectionStore.getState().state.selectedField).toBeNull();
  });

  it('keeps the activity drawer closed when selecting a canvas table', async () => {
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-load-sample'));
    useUIChromeStore.getState().setSidebarVisible(false);

    const headers = await screen.findAllByTestId('type-node-header');
    const sowingHeader = headers.find((header) => header.textContent?.includes('Sowing'));
    expect(sowingHeader).toBeDefined();
    fireEvent.click(sowingHeader as HTMLElement);

    expect(useGraphSelectionStore.getState().state.primaryNodeId).toBe('Sowing');
    expect(useUIChromeStore.getState().sidebarVisible).toBe(false);
    await waitFor(() => {
      expect(screen.getByLabelText('Properties inspector')).toHaveTextContent('Sowing');
    });

    fireEvent.doubleClick(sowingHeader as HTMLElement);

    expect(useUIChromeStore.getState().sidebarVisible).toBe(false);
  });

  it('explains readiness checks from the grouped status tiles', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-load-sample'));
    useDocumentStore.getState().setFilePath('/Users/rufus/Apps/todo/todo.contexture.json');
    await waitFor(() => {
      expect(screen.getByLabelText(/Agent: Convex AI files: ready/)).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText(/Agent: Convex AI files: ready/));

    expect(screen.getByText('Agent readiness')).toBeInTheDocument();
    expect(screen.getByText('2/2 checks ready.')).toBeInTheDocument();
    expect(screen.getByTestId('agent-setup-install-value')).toHaveTextContent(
      'codex mcp add contexture -- /Applications/Contexture.app/Contents/Resources/bin/contexture-mcp',
    );
    expect(screen.getAllByText('Ready').length).toBeGreaterThanOrEqual(2);
  });

  it('opens the file picker from the start screen', async () => {
    const contexture = (window as unknown as { contexture: { file: { openDialog: unknown } } })
      .contexture;
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-open-model'));

    await waitFor(() => {
      expect(contexture.file.openDialog).toHaveBeenCalled();
    });
  });

  it('opens the agent tab visibly from the start screen', async () => {
    useUIChromeStore.getState().setSidebarVisible(false);
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-open-agent'));

    expect(useUIChromeStore.getState().sidebarVisible).toBe(true);
    expect(useUIChromeStore.getState().sidebarTab).toBe('chat');
  });
});
