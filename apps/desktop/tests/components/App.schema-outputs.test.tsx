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
  useDocumentStore.getState().setFilePath(null);
  useDocumentStore.getState().setMode('bundle');
  useGraphSelectionStore.getState().clear();
  useUIChromeStore.getState().setSidebarVisible(true);
  useUIChromeStore.getState().setSidebarTab('schema');
  (window as unknown as { contexture: unknown }).contexture = {
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
  vi.clearAllMocks();
});

describe('App schema outputs', () => {
  it('lets users enable optional outputs from the Schema panel', async () => {
    useUndoStore.getState().apply({
      kind: 'replace_schema',
      schema: {
        version: '1',
        types: [{ kind: 'object', name: 'Lead', fields: [] }],
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('schema-output-config')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('schema-output-config'));
    fireEvent.click(screen.getByTestId('schema-output-ai-tool-schemas'));

    await waitFor(() => {
      expect(useUndoStore.getState().schema.outputs?.aiPipeline?.toolSchemas?.enabled).toBe(true);
    });
    expect(screen.getByTestId('schema-code').textContent).toContain('submit_lead');
  });

  it('uses a valid fallback import in unsaved form-validator previews', async () => {
    useUndoStore.getState().apply({
      kind: 'replace_schema',
      schema: {
        version: '1',
        outputs: { aiPipeline: { formValidators: { enabled: true } } },
        types: [{ kind: 'object', name: 'Lead', fields: [] }],
      },
    });

    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('schema-output-selector'));
    fireEvent.click(await screen.findByTestId('schema-output-form-validators'));

    await waitFor(() => {
      expect(screen.getByTestId('schema-code').textContent ?? '').toContain(
        "import { Lead } from './schema.schema';",
      );
    });
    expect(screen.getByTestId('schema-code').textContent ?? '').not.toContain('<unsaved>');
  });
});
