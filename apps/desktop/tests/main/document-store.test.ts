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
// In project mode, layout and chat live inside the `.contexture/` marker
// directory (they're implementation sidecars, not part of the document
// package API). The old `<name>.contexture.layout.json` naming from the
// scratch era is no longer used.
const layoutPath = '/work/.contexture/layout.json';
const chatPath = '/work/.contexture/chat.json';
const schemaTsPath = '/work/garden.schema.ts';
const schemaJsonPath = '/work/garden.schema.json';
// Old per-IR sidecar paths — kept only so the "no leftovers" regression
// test can assert they do *not* get created in either mode.
const legacyLayoutPath = '/work/garden.contexture.layout.json';
const legacyChatPath = '/work/garden.contexture.chat.json';

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

/** Seed a `.contexture/` marker dir so the store treats the workspace as project mode. */
const PROJECT_MARKER = { '/work/.contexture/.keep': '' } as const;

describe('DocumentStore', () => {
  let harness: Harness;

  beforeEach(() => {
    // Default harness is project-mode so existing save semantics (5-file
    // bundle + emitters) continue to apply. Scratch-mode tests opt out by
    // building their own harness with no .contexture/ marker.
    harness = setup({ ...PROJECT_MARKER });
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
      ...PROJECT_MARKER,
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

  it("open returns mode:'scratch' when no .contexture/ sibling exists", async () => {
    const seed = setup({ [irPath]: JSON.stringify(sampleIR) });
    const bundle = await seed.store.open(irPath);
    expect(bundle.mode).toBe('scratch');
  });

  it("open returns mode:'project' when a .contexture/ directory sits next to the IR", async () => {
    const seed = setup({
      [irPath]: JSON.stringify(sampleIR),
      // The mem-fs adapter models dirs by presence of any path under them.
      '/work/.contexture/emitted.json': '{}',
    });
    const bundle = await seed.store.open(irPath);
    expect(bundle.mode).toBe('project');
  });

  it('project-mode save writes Convex schema.ts next to the IR with the contexture-generated banner', async () => {
    await harness.store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    const convexPath = '/work/schema.ts';
    expect(harness.fs.exists(convexPath)).toBe(true);
    const convex = await harness.fs.readFile(convexPath);
    expect(convex).toContain('@contexture-generated');
    expect(convex).toMatch(/defineSchema\s*\(/);
  });

  it('project-mode save writes a schema index re-export next to the IR', async () => {
    await harness.store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    const indexPath = '/work/index.ts';
    expect(harness.fs.exists(indexPath)).toBe(true);
    const source = await harness.fs.readFile(indexPath);
    expect(source).toContain('@contexture-generated');
    expect(source).toContain(`export * from './garden.schema';`);
  });

  it('project-mode open writes CLAUDE.md at the project root if missing, with {{PROJECT_NAME}} substituted', async () => {
    const monorepoIrPath = '/proj/packages/schema/my-app.contexture.json';
    const { store, fs } = setup({
      [monorepoIrPath]: JSON.stringify(sampleIR),
      '/proj/packages/schema/.contexture/.keep': '',
    });
    const bundle = await store.open(monorepoIrPath);
    expect(bundle.mode).toBe('project');
    expect(fs.exists('/proj/CLAUDE.md')).toBe(true);
    const claude = await fs.readFile('/proj/CLAUDE.md');
    expect(claude).toContain('my-app');
    expect(claude).not.toContain('{{PROJECT_NAME}}');
  });

  it('project-mode open never overwrites an existing CLAUDE.md', async () => {
    const monorepoIrPath = '/proj/packages/schema/my-app.contexture.json';
    const { store, fs } = setup({
      [monorepoIrPath]: JSON.stringify(sampleIR),
      '/proj/packages/schema/.contexture/.keep': '',
      '/proj/CLAUDE.md': '# user-owned notes\n',
    });
    await store.open(monorepoIrPath);
    const claude = await fs.readFile('/proj/CLAUDE.md');
    expect(claude).toBe('# user-owned notes\n');
  });

  it('scratch-mode open does not write CLAUDE.md', async () => {
    const { store, fs } = setup({ [irPath]: JSON.stringify(sampleIR) });
    await store.open(irPath);
    // No standard project root for scratch files — the parent-parent dir
    // would be `/`, and scratch IR by definition has no project layout
    // so CLAUDE.md must not appear anywhere.
    expect(fs.exists('/CLAUDE.md')).toBe(false);
  });

  it('project-mode save writes .contexture/emitted.json with hashes of every @contexture-generated file', async () => {
    await harness.store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    const manifestPath = '/work/.contexture/emitted.json';
    expect(harness.fs.exists(manifestPath)).toBe(true);
    const manifest = JSON.parse(await harness.fs.readFile(manifestPath)) as {
      version: string;
      files: Record<string, string>;
    };
    expect(manifest.version).toBe('1');
    // Every emitted artefact has a hash entry; IR itself is not generated
    // (it's the source of truth) so it is not in the manifest.
    expect(Object.keys(manifest.files).sort()).toEqual(
      [
        '/work/garden.schema.ts',
        '/work/garden.schema.json',
        '/work/index.ts',
        '/work/schema.ts',
      ].sort(),
    );
    for (const hash of Object.values(manifest.files)) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('scratch-mode save does not write a schema index', async () => {
    const { store, fs } = setup();
    await store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    expect(fs.exists('/work/index.ts')).toBe(false);
  });

  it('project-mode save writes layout + chat into .contexture/, not next to the IR', async () => {
    await harness.store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    expect(harness.fs.exists('/work/.contexture/layout.json')).toBe(true);
    expect(harness.fs.exists('/work/.contexture/chat.json')).toBe(true);
    // The legacy sibling locations must not be populated — they were the
    // scratch-era layout/chat paths and are no longer used.
    expect(harness.fs.exists(legacyLayoutPath)).toBe(false);
    expect(harness.fs.exists(legacyChatPath)).toBe(false);
  });

  it('scratch-mode save writes only the IR file — no layout/chat/mirrors', async () => {
    const { store, fs } = setup();
    await store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    expect(fs.exists(irPath)).toBe(true);
    expect(fs.exists(layoutPath)).toBe(false);
    expect(fs.exists(chatPath)).toBe(false);
    expect(fs.exists(schemaTsPath)).toBe(false);
    expect(fs.exists(schemaJsonPath)).toBe(false);
  });

  it('scratch-mode round-trip: reopening returns default layout + empty chat', async () => {
    const { store } = setup();
    await store.save({
      irPath,
      schema: sampleIR,
      layout: sampleLayout,
      chat: sampleChat,
    });
    const reopened = await store.open(irPath);
    expect(reopened.mode).toBe('scratch');
    expect(reopened.schema).toEqual(sampleIR);
    expect(reopened.layout.positions).toEqual({});
    expect(reopened.chat.messages).toEqual([]);
    expect(reopened.warnings).toEqual([]);
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
