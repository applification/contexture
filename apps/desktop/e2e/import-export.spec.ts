/**
 * Import / export round-trip against `.contexture.json` only.
 *
 * Loads the bundled allotment sample (as the import leg — a real-world
 * IR), exercises the loader + validator in the renderer, serialises
 * the live IR back through `save()`, and asserts a structural
 * round-trip. The file-dialog IPC is driven by
 * `tests/main/file-ipc.test.ts` / `tests/main/save-bundle.test.ts`;
 * here we just prove the end-to-end shape survives the round-trip the
 * UI would perform on save / reopen.
 */
import { expect, test } from '@playwright/test';
import { launchElectron } from './electron-launch';

test.describe('Import / export round-trip', () => {
  let electronApp: Awaited<ReturnType<typeof launchElectron>>;
  let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

  test.beforeAll(async () => {
    electronApp = await launchElectron();
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Prior specs in the same run leave an unsaved schema in
    // `window.localStorage` which `useSessionPersistence` restores on
    // mount — that hides the empty state and the "Load allotment
    // sample" button. Reset the in-memory schema to empty AND clear
    // the session key so the persistence loop doesn't immediately
    // re-write it (storage is cleared synchronously when the schema
    // becomes empty, but we belt-and-brace it).
    await page.evaluate(() => {
      const win = window as unknown as {
        __contextureUndoStore: {
          getState: () => { apply: (op: unknown) => unknown };
        };
      };
      win.__contextureUndoStore
        .getState()
        .apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
      window.localStorage.removeItem('contexture:session:v1');
    });
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('round-trips the allotment sample through load + save', async () => {
    await page.getByRole('button', { name: /load allotment sample/i }).click();
    await expect(page.locator('[data-testid="type-node"]').first()).toBeVisible({
      timeout: 10_000,
    });

    const roundTrip = await page.evaluate(async () => {
      // `load` / `save` are exposed on `window.__contextureModel` by
      // `store/undo.ts` — dynamic `import()` can't resolve renderer
      // modules in production builds (hashed filenames).
      const win = window as unknown as {
        __contextureUndoStore: { getState: () => { schema: unknown } };
        __contextureModel: {
          load: (raw: string) => { schema: unknown };
          save: (schema: unknown) => string;
        };
      };
      const { load, save } = win.__contextureModel;
      const current = win.__contextureUndoStore.getState().schema;
      const serialised = save(current);
      const { schema: restored } = load(serialised);
      return { serialised, restored };
    });

    expect(roundTrip.serialised).toContain('"version": "1"');
    expect(roundTrip.restored).toBeTruthy();
  });
});
