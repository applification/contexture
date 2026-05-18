/**
 * Regression coverage for the bundled allotment fixture.
 *
 * `samples/allotment.contexture.json` is the canonical bare IR shipped
 * inside the app. Opening it should be read-only; saving it should
 * initialize the full document bundle.
 */
import { bundlePathsFor, createDocumentStore } from '@main/documents/document-store';
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { describe, expect, it } from 'vitest';
import allotment from '../../src/renderer/src/samples/allotment.contexture.json' with {
  type: 'json',
};

const IR_PATH = '/work/allotment.contexture.json';

describe('allotment fixture', () => {
  it('opens the allotment sample in bundle mode', async () => {
    const fs = createMemFsAdapter({ [IR_PATH]: JSON.stringify(allotment) });
    const store = createDocumentStore({ fs, recentFilesPath: '/userData/recent-files.json' });
    const bundle = await store.open(IR_PATH);
    expect(bundle.mode).toBe('bundle');
    expect(bundle.schema.types.length).toBe(allotment.types.length);
    expect(bundle.warnings).toEqual([]);
  });

  it('save initializes bundle sidecars and generated files', async () => {
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
    expect(await fs.fileExists(paths.layout)).toBe(true);
    expect(await fs.fileExists(paths.chat)).toBe(true);
    expect(await fs.fileExists(paths.emitted)).toBe(true);
    expect(await fs.fileExists(paths.schemaTs)).toBe(true);
    expect(await fs.fileExists(paths.schemaJson)).toBe(true);
    expect(await fs.fileExists(paths.convex)).toBe(true);
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
    expect(second.mode).toBe('bundle');
    expect(second.schema.types.map((t) => t.name)).toEqual(first.schema.types.map((t) => t.name));
  });
});
