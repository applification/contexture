import { createDocumentStore } from '@main/documents/document-store';
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import {
  CHAT_CONTEXT_FILE_FILTER,
  CHAT_CONTEXT_PHOTO_FILTER,
  CONTEXTURE_OPEN_FILTER,
  CONTEXTURE_SAVE_FILTER,
  handleOpen,
  handlePickChatContextFiles,
  setDocumentStoreForTesting,
} from '@main/ipc/file';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('handleOpen (routes through DocumentStore)', () => {
  const irPath = '/work/garden.contexture.json';
  const schema = { version: '1', types: [{ kind: 'object', name: 'Plot', fields: [] }] };

  afterEach(() => {
    setDocumentStoreForTesting(null);
  });

  it('returns mode: bundle when no .contexture/ sibling exists', async () => {
    const fs = createMemFsAdapter({ [irPath]: JSON.stringify(schema) });
    setDocumentStoreForTesting(
      createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' }),
    );
    const result = await handleOpen(irPath);
    expect(result?.mode).toBe('bundle');
  });

  it('returns mode: bundle when .contexture/ marker directory sits next to the IR', async () => {
    const fs = createMemFsAdapter({
      [irPath]: JSON.stringify(schema),
      '/work/.contexture/.keep': '',
    });
    setDocumentStoreForTesting(
      createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' }),
    );
    const result = await handleOpen(irPath);
    expect(result?.mode).toBe('bundle');
  });

  it('returns null when the IR file does not exist', async () => {
    const fs = createMemFsAdapter({});
    setDocumentStoreForTesting(
      createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' }),
    );
    expect(await handleOpen('/missing.contexture.json')).toBeNull();
  });

  it('rejects non-Contexture paths before reading file contents', async () => {
    const fs = createMemFsAdapter({ '/work/secret.txt': 'do not read' });
    setDocumentStoreForTesting(
      createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' }),
    );

    await expect(handleOpen('/work/secret.txt')).rejects.toThrow(/Expected a .contexture.json/);
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

  it('restricts chat context attachment dialogs to text-like files', () => {
    expect(CHAT_CONTEXT_FILE_FILTER.extensions).toContain('ts');
    expect(CHAT_CONTEXT_FILE_FILTER.extensions).toContain('md');
    expect(CHAT_CONTEXT_FILE_FILTER.extensions).not.toContain('png');
  });

  it('restricts chat photo attachment dialogs to image files', () => {
    expect(CHAT_CONTEXT_PHOTO_FILTER.extensions).toContain('png');
    expect(CHAT_CONTEXT_PHOTO_FILTER.extensions).toContain('jpg');
    expect(CHAT_CONTEXT_PHOTO_FILTER.extensions).not.toContain('ts');
  });
});

describe('handlePickChatContextFiles', () => {
  const window = {} as Parameters<typeof handlePickChatContextFiles>[0];

  it('returns explicit text attachments for selected files', async () => {
    const result = await handlePickChatContextFiles(window, {
      showOpenDialog: vi.fn(async () => ({
        canceled: false,
        filePaths: ['/repo/src/api.ts'],
      })),
      readFile: vi.fn(async () => 'export const api = {};'),
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        path: '/repo/src/api.ts',
        name: 'api.ts',
        content: 'export const api = {};',
        kind: 'text',
      }),
    );
    expect(result[0]?.truncated).toBeUndefined();
  });

  it('returns base64 image attachments from the photo picker', async () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const result = await handlePickChatContextFiles(
      window,
      {
        showOpenDialog: vi.fn(async () => ({
          canceled: false,
          filePaths: ['/repo/image.png'],
        })),
        readFile: vi.fn(async () => 'unused'),
        readBinaryFile: vi.fn(async () => image),
      },
      'photos',
    );

    expect(result).toEqual([
      expect.objectContaining({
        path: '/repo/image.png',
        name: 'image.png',
        size: image.byteLength,
        content: image.toString('base64'),
        kind: 'image',
        mimeType: 'image/png',
        encoding: 'base64',
      }),
    ]);
  });

  it('allows modest images after base64 expansion', async () => {
    const image = Buffer.alloc(118 * 1024, 1);
    const result = await handlePickChatContextFiles(
      window,
      {
        showOpenDialog: vi.fn(async () => ({
          canceled: false,
          filePaths: ['/repo/screenshot.png'],
        })),
        readFile: vi.fn(async () => 'unused'),
        readBinaryFile: vi.fn(async () => image),
      },
      'photos',
    );

    expect(result).toEqual([
      expect.objectContaining({
        path: '/repo/screenshot.png',
        size: image.byteLength,
        content: image.toString('base64'),
        kind: 'image',
      }),
    ]);
  });

  it('returns no attachments when the picker is cancelled', async () => {
    const result = await handlePickChatContextFiles(window, {
      showOpenDialog: vi.fn(async () => ({
        canceled: true,
        filePaths: [],
      })),
      readFile: vi.fn(async () => 'unused'),
    });

    expect(result).toEqual([]);
  });

  it('rejects binary-looking files before adding them to context', async () => {
    await expect(
      handlePickChatContextFiles(window, {
        showOpenDialog: vi.fn(async () => ({
          canceled: false,
          filePaths: ['/repo/image.png'],
        })),
        readFile: vi.fn(async () => 'abc\0def'),
      }),
    ).rejects.toThrow(/binary file/);
  });
});
