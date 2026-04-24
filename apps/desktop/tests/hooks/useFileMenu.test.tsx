/**
 * `useFileMenu` — handlers for New / Open / Save / Save-As + recent
 * files, driven by a fake `window.contexture.file` surface.
 */
import { useFileMenu } from '@renderer/hooks/useFileMenu';
import { useDocumentStore } from '@renderer/store/document';
import { useUndoStore } from '@renderer/store/undo';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function mockFileBridge(): {
  openDialog: ReturnType<typeof vi.fn>;
  saveAsDialog: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  openRecent: ReturnType<typeof vi.fn>;
  getRecentFiles: ReturnType<typeof vi.fn>;
} {
  const openDialog = vi.fn(async () => null);
  const saveAsDialog = vi.fn(async () => null);
  const save = vi.fn(async () => undefined);
  const openRecent = vi.fn(async () => null);
  const getRecentFiles = vi.fn(async () => [] as string[]);
  (window as unknown as { contexture: unknown }).contexture = {
    chat: {},
    file: {
      openDialog,
      saveAsDialog,
      save,
      read: vi.fn(async () => ({ irPath: '', content: '' })),
      getRecentFiles,
      openRecent,
      onMenuNew: () => () => undefined,
      onMenuOpen: () => () => undefined,
      onMenuSave: () => () => undefined,
      onMenuSaveAs: () => () => undefined,
      onMenuNewProject: () => () => undefined,
    },
  };
  return { openDialog, saveAsDialog, save, openRecent, getRecentFiles };
}

beforeEach(() => {
  // Reset stores.
  useUndoStore.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
  const d = useDocumentStore.getState();
  d.setFilePath(null);
  d.markClean();
  d.clearImportWarnings();
  d.clearUnknownFormat();
  d.clearSaveWithErrors();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useFileMenu', () => {
  it('handleNew replaces the schema, clears the file path, and marks clean', () => {
    mockFileBridge();
    // Seed with something so "new" has an effect.
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    useDocumentStore.getState().setFilePath('/tmp/old.contexture.json');
    const { result } = renderHook(() => useFileMenu());
    act(() => result.current.handleNew());
    expect(useUndoStore.getState().schema.types).toEqual([]);
    expect(useDocumentStore.getState().filePath).toBeNull();
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });

  it('handleOpen loads a valid schema + stashes the path + marks clean', async () => {
    const bridge = mockFileBridge();
    bridge.openDialog.mockResolvedValueOnce({
      irPath: '/tmp/x.contexture.json',
      content: JSON.stringify({ version: '1', types: [] }),
    });
    const { result } = renderHook(() => useFileMenu());
    await act(async () => {
      await result.current.handleOpen();
    });
    expect(useDocumentStore.getState().filePath).toBe('/tmp/x.contexture.json');
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });

  it('handleOpen on a malformed file fires the unknown-format dialog', async () => {
    const bridge = mockFileBridge();
    bridge.openDialog.mockResolvedValueOnce({
      irPath: '/tmp/broken.json',
      content: '{"not": "a valid schema"}',
    });
    const { result } = renderHook(() => useFileMenu());
    await act(async () => {
      await result.current.handleOpen();
    });
    expect(useDocumentStore.getState().unknownFormatPath).toBe('/tmp/broken.json');
    // File path shouldn't have been set.
    expect(useDocumentStore.getState().filePath).toBeNull();
  });

  it('handleSave writes the bundle when there are no validation errors', async () => {
    const bridge = mockFileBridge();
    useDocumentStore.getState().setFilePath('/tmp/x.contexture.json');
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    const { result } = renderHook(() => useFileMenu());
    await act(async () => {
      await result.current.handleSave();
    });
    expect(bridge.save).toHaveBeenCalledTimes(1);
    expect(bridge.save.mock.calls[0][0]).toMatchObject({
      irPath: '/tmp/x.contexture.json',
    });
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });

  it('handleSave prompts when validation has errors; force-save writes through', async () => {
    const bridge = mockFileBridge();
    useDocumentStore.getState().setFilePath('/tmp/x.contexture.json');
    // Introduce an unresolved ref → validator barks.
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: {
        kind: 'object',
        name: 'Plot',
        fields: [{ name: 'bogus', type: { kind: 'ref', typeName: 'Nope' } }],
      },
    });
    const { result } = renderHook(() => useFileMenu());
    await act(async () => {
      await result.current.handleSave();
    });
    expect(bridge.save).not.toHaveBeenCalled();
    const prompt = useDocumentStore.getState().saveWithErrorsPrompt;
    expect(prompt).not.toBeNull();
    await act(async () => {
      if (prompt) await result.current.handleForceSave(prompt.id);
    });
    expect(bridge.save).toHaveBeenCalledTimes(1);
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });

  it('handleSaveAs always prompts for a path first', async () => {
    const bridge = mockFileBridge();
    bridge.saveAsDialog.mockResolvedValueOnce('/tmp/new.contexture.json');
    // Even with an existing path, saveAs should re-prompt.
    useDocumentStore.getState().setFilePath('/tmp/old.contexture.json');
    const { result } = renderHook(() => useFileMenu());
    await act(async () => {
      await result.current.handleSaveAs();
    });
    expect(bridge.saveAsDialog).toHaveBeenCalled();
    expect(bridge.save).toHaveBeenCalledWith(
      expect.objectContaining({ irPath: '/tmp/new.contexture.json' }),
    );
    expect(useDocumentStore.getState().filePath).toBe('/tmp/new.contexture.json');
  });

  it('handleOpen hydrates layout + chat from the bundle and passes them through onBundleLoaded', async () => {
    const bridge = mockFileBridge();
    bridge.openDialog.mockResolvedValueOnce({
      irPath: '/tmp/x.contexture.json',
      content: JSON.stringify({ version: '1', types: [] }),
      layout: { version: '1', positions: { Plot: { x: 10, y: 20 } } },
      chat: {
        version: '1',
        messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
        sessionId: 'sess-42',
      },
      warnings: [],
    });
    const onBundleLoaded = vi.fn();
    const { result } = renderHook(() =>
      useFileMenu({
        onBundleLoaded,
      }),
    );
    await act(async () => {
      await result.current.handleOpen();
    });
    expect(onBundleLoaded).toHaveBeenCalledWith({
      layout: { version: '1', positions: { Plot: { x: 10, y: 20 } } },
      chat: expect.objectContaining({ sessionId: 'sess-42' }),
    });
  });

  it('handleSave pulls the current layout + chat via the injected getters', async () => {
    const bridge = mockFileBridge();
    useDocumentStore.getState().setFilePath('/tmp/x.contexture.json');
    useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: 'Plot', fields: [] },
    });
    const { result } = renderHook(() =>
      useFileMenu({
        getLayout: () => ({ version: '1', positions: { Plot: { x: 5, y: 6 } } }),
        getChat: () => ({
          version: '1',
          messages: [{ id: 'm', role: 'user', content: 'yo', createdAt: 1 }],
        }),
      }),
    );
    await act(async () => {
      await result.current.handleSave();
    });
    expect(bridge.save).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: { version: '1', positions: { Plot: { x: 5, y: 6 } } },
        chat: expect.objectContaining({ messages: [expect.objectContaining({ content: 'yo' })] }),
      }),
    );
  });

  it('handleOpen hydrates mode on the document store (scratch)', async () => {
    const bridge = mockFileBridge();
    bridge.openDialog.mockResolvedValueOnce({
      irPath: '/tmp/x.contexture.json',
      mode: 'scratch',
      content: JSON.stringify({ version: '1', types: [] }),
    });
    const { result } = renderHook(() => useFileMenu());
    await act(async () => {
      await result.current.handleOpen();
    });
    expect(useDocumentStore.getState().mode).toBe('scratch');
  });

  it('handleOpen hydrates mode on the document store (project)', async () => {
    const bridge = mockFileBridge();
    bridge.openDialog.mockResolvedValueOnce({
      irPath: '/tmp/x.contexture.json',
      mode: 'project',
      content: JSON.stringify({ version: '1', types: [] }),
    });
    const { result } = renderHook(() => useFileMenu());
    await act(async () => {
      await result.current.handleOpen();
    });
    expect(useDocumentStore.getState().mode).toBe('project');
  });

  it('handleNew resets mode to scratch', () => {
    mockFileBridge();
    useDocumentStore.getState().setMode('project');
    const { result } = renderHook(() => useFileMenu());
    act(() => result.current.handleNew());
    expect(useDocumentStore.getState().mode).toBe('scratch');
  });

  it('handleOpenPath opens via the recent-files channel', async () => {
    const bridge = mockFileBridge();
    bridge.openRecent.mockResolvedValueOnce({
      irPath: '/tmp/recent.contexture.json',
      content: JSON.stringify({ version: '1', types: [] }),
    });
    const { result } = renderHook(() => useFileMenu());
    await act(async () => {
      await result.current.handleOpenPath('/tmp/recent.contexture.json');
    });
    expect(bridge.openRecent).toHaveBeenCalledWith('/tmp/recent.contexture.json');
    expect(useDocumentStore.getState().filePath).toBe('/tmp/recent.contexture.json');
  });
});
