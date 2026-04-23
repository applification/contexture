/**
 * DocumentStore — the one object the rest of the app opens / saves /
 * lists recents through. Tests drive it through a `MemFsAdapter` so
 * boundary behaviour (atomic write, rollback, parse fallbacks) is
 * exercised without touching a real disk.
 *
 * The six cases below map to the issue's acceptance list:
 *   1. Round-trip open→save→open preserves IR + layout + chat.
 *   2. Save-as to a new path preserves layout content verbatim.
 *   3. Partial sidecar corruption: open succeeds with warnings.
 *   4. Save is atomic — a mid-write failure rolls back every sibling.
 *   5. Emitter failure aborts the save and leaves disk untouched.
 *   6. `recentFiles()` tracks open + save, most-recent first, deduped.
 */

import { createDocumentStore, type DocumentStore } from '@main/documents/document-store';
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import type { ChatHistory } from '@renderer/model/chat-history';
import type { Schema } from '@renderer/model/ir';
import type { Layout } from '@renderer/model/layout';
import { beforeEach, describe, expect, it } from 'vitest';

const irPath = '/work/garden.contexture.json';
const layoutPath = '/work/garden.contexture.layout.json';
const chatPath = '/work/garden.contexture.chat.json';
const schemaTsPath = '/work/garden.schema.ts';
const schemaJsonPath = '/work/garden.schema.json';

const sampleIR: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Plot', fields: [] }],
};
const sampleLayout: Layout = {
  version: '1',
  positions: { Plot: { x: 10, y: 20 } },
};
const sampleChat: ChatHistory = {
  version: '1',
  messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
};

interface Harness {
  store: DocumentStore;
  fs: ReturnType<typeof createMemFsAdapter>;
}

function setup(seed: Record<string, string> = {}): Harness {
  const fs = createMemFsAdapter(seed);
  const store = createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' });
  return { store, fs };
}

describe('DocumentStore', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = setup();
  });

  it('round-trips: save then open returns the same IR + layout + chat', async () => {
    await harness.store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });

    // Fresh store, same fs — proves the round-trip goes through disk.
    const { store } = {
      store: createDocumentStore({
        fs: harness.fs,
        recentFilesPath: '/userData/recent-files.json',
      }),
    };
    const bundle = await store.open(irPath);

    expect(bundle.schema).toEqual(sampleIR);
    expect(bundle.layout).toEqual(sampleLayout);
    expect(bundle.chat).toEqual(sampleChat);
    expect(bundle.warnings).toEqual([]);
  });

  it('saveAs writes to the new path and preserves layout content verbatim', async () => {
    await harness.store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });

    const newPath = '/work/renamed.contexture.json';
    await harness.store.saveAs(
      { schema: sampleIR, layout: sampleLayout, chat: sampleChat },
      newPath,
    );

    const reopened = await harness.store.open(newPath);
    expect(reopened.layout.positions).toEqual({ Plot: { x: 10, y: 20 } });
    // Original still present — saveAs is a copy-to-new-path, not a move.
    expect(harness.fs.exists(irPath)).toBe(true);
  });

  it('open succeeds with warnings when a sidecar is corrupt', async () => {
    const seed = setup({
      [irPath]: JSON.stringify(sampleIR),
      [layoutPath]: '{not valid json',
      [chatPath]: JSON.stringify(sampleChat),
    });
    const bundle = await seed.store.open(irPath);
    expect(bundle.schema).toEqual(sampleIR);
    // Corrupt layout falls back to defaults with a warning.
    expect(bundle.layout.positions).toEqual({});
    expect(bundle.warnings.some((w) => /layout/i.test(w.message))).toBe(true);
  });

  it('save is atomic — a mid-write failure leaves every sibling untouched', async () => {
    // Seed existing files so rollback has something to restore.
    await harness.store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });

    // Inject a write failure on the .schema.ts tmp write (the last of
    // the five files to land), to exercise rollback after partial success.
    harness.fs.failWritesMatching(/\.schema\.ts\.tmp$/);

    await expect(
      harness.store.save({
        irPath,
        schema: { version: '1', types: [{ kind: 'object', name: 'Updated', fields: [] }] },
        layout: { version: '1', positions: { Updated: { x: 99, y: 99 } } },
        chat: sampleChat,
      }),
    ).rejects.toThrow();

    // Every file is back to its pre-save content.
    const reopened = await harness.store.open(irPath);
    expect(reopened.schema).toEqual(sampleIR);
    expect(reopened.layout).toEqual(sampleLayout);
    // No .tmp leftovers.
    expect(harness.fs.listTmp()).toEqual([]);
  });

  it('emitter failure aborts the save and leaves disk untouched', async () => {
    const failingEmitter = () => {
      throw new Error('emit boom');
    };
    const store = createDocumentStore({
      fs: harness.fs,
      recentFilesPath: '/userData/recent-files.json',
      emitZod: failingEmitter,
    });

    await expect(
      store.save({
        irPath,
        schema: sampleIR,
        layout: sampleLayout,
        chat: sampleChat,
      }),
    ).rejects.toThrow(/emit boom/);

    expect(harness.fs.exists(irPath)).toBe(false);
    expect(harness.fs.exists(layoutPath)).toBe(false);
    expect(harness.fs.exists(chatPath)).toBe(false);
    expect(harness.fs.exists(schemaTsPath)).toBe(false);
    expect(harness.fs.exists(schemaJsonPath)).toBe(false);
  });

  it('recentFiles tracks save + open, most-recent first, deduplicated', async () => {
    await harness.store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    const secondPath = '/work/other.contexture.json';
    await harness.store.save({
      irPath: secondPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    // Re-open the first file — it should jump to the head of the list.
    await harness.store.open(irPath);

    const recents = await harness.store.recentFiles();
    expect(recents.map((r) => r.path)).toEqual([irPath, secondPath]);
  });
});
