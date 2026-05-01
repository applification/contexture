/**
 * Contexture CRUD round-trip:
 *   1. Open the app with an empty schema.
 *   2. Load the bundled allotment sample (replace_schema op).
 *   3. Assert the canvas renders at least one TypeNode.
 *   4. Double-click the empty pane to add a new type (add_type op).
 *   5. Assert the new type appears on the canvas.
 *
 * Driven entirely through the renderer's global `useUndoStore` to sidestep
 * XYFlow's reliance on layout measurements that are flaky in headless CI.
 * The "real" CRUD round-trip via file save/reload is covered by the unit
 * tests in `tests/main/save-bundle.test.ts` and
 * `tests/main/write-bundle-atomic.test.ts`.
 */
import { expect, test } from '@playwright/test';
import { launchElectron } from './electron-launch';

test.describe('Contexture CRUD', () => {
  let electronApp: Awaited<ReturnType<typeof launchElectron>>;
  let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

  test.beforeAll(async () => {
    electronApp = await launchElectron();
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // `useSessionPersistence` restores any unsaved schema left in
    // `window.localStorage` by a prior spec, which would hide the
    // empty state and the "Load allotment sample" button. Reset the
    // in-memory schema to empty AND clear the session key so the
    // persistence loop doesn't immediately re-write it.
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

  test('loads the allotment sample and renders TypeNodes', async () => {
    // Click the "Load allotment sample" button in the header.
    const button = page.getByRole('button', { name: /load allotment sample/i });
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    // Each TypeDef becomes a TypeNode.
    await expect(page.locator('[data-testid="type-node"]').first()).toBeVisible({
      timeout: 10_000,
    });

    const nodes = page.locator('[data-testid="type-node"]');
    const count = await nodes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('add_type via the undoable store appends a TypeNode', async () => {
    // Run the op directly through the renderer — XYFlow's pane
    // double-click handler is flaky in jsdom/headless electron.
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __contextureUndoStore?: { getState: () => { apply: (op: unknown) => unknown } };
        }
      ).__contextureUndoStore;
      if (!store) throw new Error('undo store not exposed');
      store.getState().apply({
        kind: 'add_type',
        type: { kind: 'object', name: 'E2EType', fields: [] },
      });
    });

    await expect(page.locator('[data-type-name="E2EType"]')).toBeVisible();
  });
});
