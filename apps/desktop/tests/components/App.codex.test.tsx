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
  useUIChromeStore.getState().setSidebarTab('properties');
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
    expect(useUIChromeStore.getState().sidebarTab).toBe('schema');
    expect(screen.getByTestId('onboarding-loop')).toHaveTextContent('Project readiness');
    expect(screen.getByLabelText(/Model: Table: ready/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Generated: Files visible: ready/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Saved: needs action/)).toBeInTheDocument();
  });

  it('explains readiness checks from the grouped status tiles', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.click(await screen.findByTestId('start-load-sample'));
    await user.click(screen.getByLabelText(/Agent: Convex AI files: needs action/));

    expect(screen.getByText('Agent readiness')).toBeInTheDocument();
    expect(
      screen.getByText('Run bunx convex ai-files install in the target repo.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Agent setup is not auto-detected yet, so this group stays informational even after you connect Codex or install Convex AI files.',
      ),
    ).toBeInTheDocument();
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
