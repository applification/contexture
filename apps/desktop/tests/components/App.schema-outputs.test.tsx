import App from '@renderer/App';
import { useDocumentStore } from '@renderer/store/document';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { useUndoStore } from '@renderer/store/undo';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    await waitFor(() => {
      expect(screen.getByTestId('schema-output-form-validators')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('schema-output-form-validators'));

    const code = screen.getByTestId('schema-code').textContent ?? '';
    expect(code).toContain("import { Lead } from './schema.schema';");
    expect(code).not.toContain('<unsaved>');
  });
});
