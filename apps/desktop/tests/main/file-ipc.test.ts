import { createDocumentStore } from '@main/documents/document-store';
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import {
  CONTEXTURE_OPEN_FILTER,
  CONTEXTURE_SAVE_FILTER,
  handleOpen,
  setDocumentStoreForTesting,
} from '@main/ipc/file';
import { afterEach, describe, expect, it } from 'vitest';

describe('handleOpen (routes through DocumentStore)', () => {
  const irPath = '/work/garden.contexture.json';
  const schema = { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] };

  afterEach(() => {
    setDocumentStoreForTesting(null);
  });

  it('returns mode: scratch when no .contexture/ sibling exists', async () => {
    const fs = createMemFsAdapter({ [irPath]: JSON.stringify(schema) });
    setDocumentStoreForTesting(
      createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' }),
    );
    const result = await handleOpen(irPath);
    expect(result?.mode).toBe('scratch');
  });

  it('returns mode: project when .contexture/ marker directory sits next to the IR', async () => {
    const fs = createMemFsAdapter({
      [irPath]: JSON.stringify(schema),
      '/work/.contexture/.keep': '',
    });
    setDocumentStoreForTesting(
      createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' }),
    );
    const result = await handleOpen(irPath);
    expect(result?.mode).toBe('project');
  });

  it('returns null when the IR file does not exist', async () => {
    const fs = createMemFsAdapter({});
    setDocumentStoreForTesting(
      createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' }),
    );
    expect(await handleOpen('/missing.contexture.json')).toBeNull();
  });
});

describe('file IPC open/save filters', () => {
  // Electron's FileFilter.extensions is a bare extension list (no dot,
  // no multi-segment values). The double-extension `.contexture.json`
  // lives on defaultPath; the filter just caps the file browser to
  // `.json`.
  it('restricts Open dialogs to .json with a Contexture-branded label', () => {
    expect(CONTEXTURE_OPEN_FILTER.extensions).toEqual(['json']);
    expect(CONTEXTURE_OPEN_FILTER.name).toMatch(/contexture/i);
  });

  it('restricts Save dialogs to .json', () => {
    expect(CONTEXTURE_SAVE_FILTER.extensions).toEqual(['json']);
  });
});
