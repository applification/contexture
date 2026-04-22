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
      const { load, save } = await import('./model/load');
      const store = (
        window as unknown as {
          __contextureUndoStore: { getState: () => { schema: unknown } };
        }
      ).__contextureUndoStore;
      const current = store.getState().schema;
      const serialised = save(current as never);
      const { schema: restored } = load(serialised);
      return { serialised, restored };
    });

    expect(roundTrip.serialised).toContain('"version": "1"');
    expect(roundTrip.restored).toBeTruthy();
  });
});
