/**
 * Regression coverage for legacy scratch-mode fixtures.
 *
 * `samples/allotment.contexture.json` is the canonical bare-IR bundle
 * shipped inside the app — no `.contexture/` sidecar, no emitted
 * artefacts. Opening + saving it through `DocumentStore` must remain
 * byte-clean for scratch users, regardless of what changes in project
 * mode.
 */
import { bundlePathsFor, createDocumentStore } from '@main/documents/document-store';
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { describe, expect, it } from 'vitest';
import allotment from '../../src/renderer/src/samples/allotment.contexture.json' with {
  type: 'json',
};

const IR_PATH = '/work/allotment.contexture.json';

describe('legacy scratch-mode fixture', () => {
  it('opens the allotment sample as scratch', async () => {
    const fs = createMemFsAdapter({ [IR_PATH]: JSON.stringify(allotment) });
    const store = createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' });
    const bundle = await store.open(IR_PATH);
    expect(bundle.mode).toBe('scratch');
    expect(bundle.schema.types.length).toBe(allotment.types.length);
    expect(bundle.warnings).toEqual([]);
  });

  it('save in scratch mode writes only the IR — no emit/manifest sidecars', async () => {
    const fs = createMemFsAdapter({ [IR_PATH]: JSON.stringify(allotment) });
    const store = createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' });
    const bundle = await store.open(IR_PATH);
    await store.save({
      irPath: IR_PATH,
      schema: bundle.schema,
      layout: bundle.layout,
      chat: bundle.chat,
    });
    const paths = bundlePathsFor(IR_PATH);
    expect(await fs.fileExists(paths.ir)).toBe(true);
    expect(await fs.fileExists(paths.layout)).toBe(false);
    expect(await fs.fileExists(paths.chat)).toBe(false);
    expect(await fs.fileExists(paths.emitted)).toBe(false);
    expect(await fs.fileExists(paths.schemaTs)).toBe(false);
    expect(await fs.fileExists(paths.schemaJson)).toBe(false);
    expect(await fs.fileExists(paths.convex)).toBe(false);
  });

  it('open → save → reopen preserves all types', async () => {
    const fs = createMemFsAdapter({ [IR_PATH]: JSON.stringify(allotment) });
    const store = createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' });
    const first = await store.open(IR_PATH);
    await store.save({
      irPath: IR_PATH,
      schema: first.schema,
      layout: first.layout,
      chat: first.chat,
    });
    const second = await store.open(IR_PATH);
    expect(second.schema.types.map((t) => t.name)).toEqual(first.schema.types.map((t) => t.name));
  });
});
